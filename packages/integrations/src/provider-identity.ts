/** Both foreground and scheduled pulls use the same IDs, including after storage eviction. */
export async function providerIdentity(
  kind: "calendar" | "event",
  parent: string,
  remote: string,
): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`VeloraDesk ${kind} v1:${parent}:${remote}`),
    ),
  );
  return `${kind}:${Array.from(bytes.subarray(0, 20), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
