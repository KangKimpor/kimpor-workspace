import {
  assertCapacity,
  database,
  encoded,
  env,
  HttpError,
  json,
  nudge,
  owner,
  serve,
} from "../_shared/runtime.ts";
serve(async (request) => {
  const userId = await owner(request);
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id") || "";
    const records = (await database(
      `attachments?user_id=eq.${encoded(userId)}&id=eq.${encoded(id)}`,
    )) as { path: string; mime: string }[];
    if (!records[0]) throw new HttpError(404, "Attachment not found");
    const response = await fetch(
      `${env("SUPABASE_URL")}/storage/v1/object/authenticated/attachments/${records[0].path.split("/").map(encoded).join("/")}`,
      {
        headers: {
          Authorization: request.headers.get("authorization")!,
          apikey: env("SUPABASE_ANON_KEY"),
        },
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!response.ok) throw new HttpError(503, "Attachment is unavailable");
    return new Response(response.body, {
      headers: {
        "Content-Type": records[0].mime,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (request.method !== "POST") throw new HttpError(405, "Use POST");
  if (Number(request.headers.get("content-length")) > 11_000_000)
    throw new HttpError(413, "Attachment request exceeds 10 MB");
  const form = await request.formData(),
    file = form.get("file"),
    id = String(form.get("id") || ""),
    page = String(form.get("pageId") || ""),
    changeId = String(form.get("changeId") || "");
  if (
    !(file instanceof File) ||
    !/^[-a-f0-9]{36}$/i.test(id) ||
    !page ||
    page.length > 160 ||
    changeId !== `attachment:${id}` ||
    file.size > 10_485_760
  )
    throw new HttpError(400, "Choose a file smaller than 10 MB");
  const pages = (await database(
    `pages?user_id=eq.${encoded(userId)}&id=eq.${encoded(page)}&select=fields`,
  )) as { fields: Record<string, { value: unknown }> }[];
  if (!pages[0]) throw new HttpError(404, "Page not found");
  const permitted = [
    "application/octet-stream",
    "image/webp",
    "image/png",
    "image/jpeg",
    "application/pdf",
    "text/plain",
  ];
  if (!permitted.includes(file.type))
    throw new HttpError(400, "Unsupported attachment type");
  if (
    pages[0].fields["properties.__locked"]?.value === true &&
    file.type !== "application/octet-stream"
  )
    throw new HttpError(
      400,
      "Protected documents require encrypted attachments",
    );
  const path = `${userId}/${id}`;
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const old = (await database(
    `attachments?user_id=eq.${encoded(userId)}&id=eq.${encoded(id)}`,
  )) as { page_id: string; digest: string }[];
  if (old.length) {
    if (old[0]!.page_id !== page || old[0]!.digest !== digest)
      throw new HttpError(409, "Attachment identity was reused");
    return json({ ok: true, path });
  }
  await assertCapacity(file.size);
  const response = await fetch(
    `${env("SUPABASE_URL")}/storage/v1/object/attachments/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: file,
      signal: AbortSignal.timeout(25000),
    },
  );
  if (!response.ok) {
    if (response.status !== 409 && response.status !== 400)
      throw new HttpError(
        503,
        "File upload failed. The original remains on your device.",
      );
    // A previous request may have uploaded bytes before metadata registration failed.
    const existing = await fetch(
      `${env("SUPABASE_URL")}/storage/v1/object/authenticated/attachments/${path}`,
      {
        headers: {
          Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        },
        signal: AbortSignal.timeout(25000),
      },
    );
    if (
      !existing.ok ||
      Number(existing.headers.get("content-length") || 0) > 10_485_760
    )
      throw new HttpError(503, "File upload is waiting for a retry.");
    const bytes = await existing.arrayBuffer();
    const existingDigest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    if (bytes.byteLength !== file.size || existingDigest !== digest)
      throw new HttpError(409, "Attachment identity was reused");
  }
  const metadata = {
    id,
    user_id: userId,
    page_id: page,
    path,
    bytes: file.size,
    mime: file.type,
    name: file.name.slice(0, 255),
    digest,
  };
  try {
    await database("rpc/register_attachment", {
      method: "POST",
      body: JSON.stringify({ owner_id: userId, metadata, change_id: changeId }),
    });
  } catch (error) {
    await fetch(`${env("SUPABASE_URL")}/storage/v1/object/attachments`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [path] }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
    throw error;
  }
  await nudge(userId);
  return json({ ok: true, path });
});
