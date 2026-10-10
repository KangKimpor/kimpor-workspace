import { env, HttpError } from "./runtime.ts";
const encoder = new TextEncoder();
function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function toBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value));
}
async function key() {
  const bytes = fromBase64(env("CREDENTIAL_ENCRYPTION_KEY"));
  if (bytes.length !== 32)
    throw new Error("Credential encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(value: unknown, userId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(userId) },
    await key(),
    encoder.encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    v: 1,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  });
}
export async function unseal<T>(raw: string, userId: string): Promise<T> {
  try {
    const value = JSON.parse(raw);
    if (value.v !== 1) throw new Error();
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(value.iv),
        additionalData: encoder.encode(userId),
      },
      await key(),
      fromBase64(value.data),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new HttpError(500, "Stored account credentials could not be opened");
  }
}
