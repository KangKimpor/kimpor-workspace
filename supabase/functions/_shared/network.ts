import { HttpError } from "./runtime.ts";
export function safeRemoteUrl(raw: string, allowedHosts?: string[]): URL {
  const url = new URL(raw.replace(/^webcal:/i, "https:"));
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    !host.includes(".") ||
    (allowedHosts && !allowedHosts.includes(host))
  )
    throw new HttpError(400, "Use a public HTTPS calendar address");
  return url;
}
export async function fetchPublic(
  raw: string,
  options: RequestInit = {},
  maxBytes = 5_000_000,
): Promise<Response> {
  let url = safeRemoteUrl(raw);
  // DNS-over-HTTPS checks every destination. No redirect or authentication is forwarded to an unchecked host.
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const type of ["A", "AAAA"]) {
      const dns = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`,
        {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!dns.ok)
        throw new HttpError(502, "Calendar DNS could not be verified");
      const result = (await dns.json()) as {
        Status: number;
        Answer?: { type: number; data: string }[];
      };
      if (result.Status !== 0 && result.Status !== 3)
        throw new HttpError(502, "Calendar DNS could not be verified");
      for (const answer of result.Answer || [])
        if (
          (answer.type === 1 || answer.type === 28) &&
          isPrivateAddress(answer.data)
        )
          throw new HttpError(
            400,
            "Private calendar servers are not permitted",
          );
    }
    const response = await fetch(url.href, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = safeRemoteUrl(
        new URL(response.headers.get("location") || "", url).href,
      );
      if (next.origin !== url.origin && options.headers)
        throw new HttpError(
          400,
          "Authenticated calendar redirected to another host",
        );
      url = next;
      continue;
    }
    if (Number(response.headers.get("content-length") || "0") > maxBytes)
      throw new HttpError(413, "Calendar response exceeds the size limit");
    const reader = response.body?.getReader();
    if (!reader) return response;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Calendar response exceeds the size limit");
      }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new Response(bytes, {
      status: response.status,
      headers: response.headers,
    });
  }
  throw new HttpError(502, "Calendar redirected too many times");
}
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.toLowerCase();
  if (ip.includes(":"))
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("fc") ||
      ip.startsWith("fd") ||
      /^fe[89ab]/.test(ip) ||
      ip.startsWith("ff") ||
      ip.startsWith("::ffff:")
    );
  const parts = ip.split(".").map(Number);
  const a = parts[0]!,
    b = parts[1]!;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0)
  );
}
