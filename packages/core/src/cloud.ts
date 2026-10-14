import { cloudConfig, currentSession } from "./cloud-auth";
import { base64ToBytes, bytesToBase64, type SyncChange } from "./store";
import type { SyncTransport } from "./sync";

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CloudError";
  }
}
export async function cloudRequest(
  path: string,
  body?: unknown,
): Promise<unknown> {
  const config = cloudConfig();
  const session = await currentSession();
  if (!config || !session)
    throw new CloudError("Sign in to enable cloud sync", 401);
  const response = await fetch(`${config.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  });
  const value = (await response.json().catch(() => null)) as {
    message?: string;
    error?: string;
  } | null;
  if (!response.ok)
    throw new CloudError(
      response.status === 503
        ? "Backend is waking up. Your edits are saved locally."
        : value?.message || value?.error || "Cloud request failed",
      response.status,
    );
  return value;
}
export class SupabaseTransport implements SyncTransport {
  async push(
    userId: string,
    changes: SyncChange[],
  ): Promise<{ acknowledged: string[] }> {
    const session = await currentSession();
    if (
      session?.user.id !== userId ||
      changes.some((change) => change.userId !== userId)
    )
      throw new CloudError("Cloud account does not match local workspace", 403);
    const records = changes.filter((change) => change.kind !== "attachment");
    const result = { acknowledged: [] as string[] };
    let batch: SyncChange[] = [],
      size = 0;
    const send = async () => {
      if (!batch.length) return;
      const response = (await cloudRequest("/rest/v1/rpc/push_changes", {
        changes: batch,
      })) as { acknowledged: string[] };
      if (
        !Array.isArray(response.acknowledged) ||
        response.acknowledged.some(
          (id) =>
            typeof id !== "string" || !batch.some((change) => change.id === id),
        )
      )
        throw new Error("Invalid sync acknowledgment");
      result.acknowledged.push(...response.acknowledged);
      batch = [];
      size = 0;
    };
    for (const record of records) {
      const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
      if (size + bytes > 1_800_000) await send();
      batch.push(record);
      size += bytes;
    }
    await send();
    for (const change of changes.filter(
      (change) => change.kind === "attachment",
    )) {
      const file = change.attachment;
      if (!file?.bytes) throw new Error("Attachment bytes are unavailable");
      const config = cloudConfig()!;
      const current = await currentSession();
      if (current?.user.id !== userId)
        throw new CloudError("Cloud account changed", 403);
      const body = new FormData();
      body.set("id", file.id);
      body.set("pageId", file.pageId);
      body.set("changeId", change.id);
      body.set(
        "file",
        new Blob([new Uint8Array(base64ToBytes(file.bytes)).buffer], {
          type: file.mime,
        }),
        file.name,
      );
      const response = await fetch(`${config.url}/functions/v1/attachments`, {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${current.access_token}`,
        },
        body,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new CloudError(
          "Attachment upload failed. Your file is queued for retry.",
          response.status,
        );
      result.acknowledged.push(change.id);
    }
    if (
      !Array.isArray(result.acknowledged) ||
      result.acknowledged.some(
        (id) =>
          typeof id !== "string" || !changes.some((change) => change.id === id),
      )
    )
      throw new Error("Invalid sync acknowledgment");
    return result;
  }
  async pull(
    userId: string,
    cursor: string | null,
  ): Promise<{ changes: SyncChange[]; cursor: string; hasMore: boolean }> {
    const session = await currentSession();
    if (session?.user.id !== userId)
      throw new CloudError("Cloud account changed", 403);
    const result = (await cloudRequest("/rest/v1/rpc/pull_changes", {
      after_cursor: cursor || "0",
      batch_limit: 200,
    })) as { changes: SyncChange[]; cursor: string; hasMore: boolean };
    if (
      !Array.isArray(result.changes) ||
      typeof result.cursor !== "string" ||
      result.changes.some(
        (change) => change.userId !== userId || change.schemaVersion !== 1,
      )
    )
      throw new Error("Invalid sync response");
    for (const change of result.changes.filter(
      (change) => change.kind === "attachment",
    )) {
      if (
        !change.attachment?.id ||
        change.attachment.pageId !== change.entityId
      )
        throw new Error("Invalid attachment response");
      const config = cloudConfig()!;
      const current = await currentSession();
      if (current?.user.id !== userId)
        throw new CloudError("Cloud account changed", 403);
      const response = await fetch(
        `${config.url}/functions/v1/attachments?id=${encodeURIComponent(change.attachment.id)}`,
        {
          headers: {
            apikey: config.key,
            Authorization: `Bearer ${current.access_token}`,
          },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok)
        throw new CloudError(
          "Attachment download is unavailable. Sync will retry.",
          response.status,
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (
        bytes.byteLength !== change.attachment.size ||
        bytes.byteLength > 10_485_760
      )
        throw new Error("Invalid attachment download");
      change.attachment.bytes = bytesToBase64(bytes);
    }
    return result;
  }
}
export interface CloudUsage {
  databaseBytes: number;
  storageBytes: number;
  databaseLimit: number;
  storageLimit: number;
  warning: boolean;
}
export async function cloudUsage(): Promise<CloudUsage> {
  return (await cloudRequest("/rest/v1/rpc/storage_usage", {})) as CloudUsage;
}
// Broadcast only a tiny wake-up hint; row payloads and document updates always use authenticated cursor pulls.
export async function subscribeCloudNudges(
  onNudge: () => void,
): Promise<() => void> {
  const config = cloudConfig();
  const session = await currentSession();
  if (!config || !session) return () => {};
  const url = new URL(
    `${config.url.replace(/^http/, "ws")}/realtime/v1/websocket`,
  );
  url.search = new URLSearchParams({
    apikey: config.key,
    vsn: "1.0.0",
  }).toString();
  const socket = new WebSocket(url.href);
  let ref = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const topic = `realtime:workspace:${session.user.id}`;
  const send = (event: string, payload: unknown) => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(
        JSON.stringify({ topic, event, payload, ref: String(++ref) }),
      );
  };
  socket.onopen = () =>
    send("phx_join", {
      config: { broadcast: { self: false }, private: true },
      access_token: session.access_token,
    });
  socket.onmessage = (event) => {
    let message: { event?: string; payload?: { event?: string } };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.event === "broadcast" && message.payload?.event === "change") {
      clearTimeout(debounce);
      debounce = setTimeout(onNudge, 300);
    }
  };
  const heartbeat = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(
        JSON.stringify({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: String(++ref),
        }),
      );
  }, 25000);
  return () => {
    clearInterval(heartbeat);
    clearTimeout(debounce);
    socket.close();
  };
}
