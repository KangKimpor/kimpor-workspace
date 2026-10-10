/** Versioned encrypted documents. Keys and passphrases never belong in IndexedDB. */
export interface EncryptedEnvelope {
  version: 1;
  algorithm: "AES-GCM";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  passwordIv: string;
  passwordWrappedKey: string;
  recoveryIv: string;
  recoveryWrappedKey: string;
  wrapVersion?: number;
}
const ITERATIONS = 310_000;
const AAD = new TextEncoder().encode("VeloraDesk encrypted document v1");
function bytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}
function encode(data: ArrayBuffer | Uint8Array) {
  let binary = "";
  for (const byte of new Uint8Array(data)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}
function source(value: Uint8Array): ArrayBuffer {
  return new Uint8Array(value).buffer;
}
async function rawKey(value: Uint8Array) {
  if (value.length !== 32) throw new Error("Invalid recovery key");
  return crypto.subtle.importKey("raw", source(value), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export function createRecoveryKey(): string {
  return encode(bytes(32))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function recoveryBytes(value: string) {
  return decode(value.trim().replace(/-/g, "+").replace(/_/g, "/"));
}
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = ITERATIONS,
): Promise<CryptoKey> {
  if (!passphrase) throw new Error("A passphrase is required");
  if (iterations < ITERATIONS || iterations > 2_000_000)
    throw new Error("Unsupported key derivation settings");
  const material = await crypto.subtle.importKey(
    "raw",
    source(new TextEncoder().encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: source(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  return crypto.subtle.encrypt(
    { name: "AES-GCM", iv: source(iv), additionalData: source(AAD) },
    key,
    source(data),
  );
}
async function decrypt(key: CryptoKey, iv: Uint8Array, data: Uint8Array) {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: source(iv), additionalData: source(AAD) },
    key,
    source(data),
  );
}
function validate(envelope: EncryptedEnvelope) {
  if (
    envelope.version !== 1 ||
    envelope.algorithm !== "AES-GCM" ||
    decode(envelope.iv).length !== 12 ||
    decode(envelope.salt).length !== 16
  )
    throw new Error("Unsupported or damaged encrypted document");
}
export async function encryptBytes(
  plaintext: Uint8Array,
  passphrase: string,
  recoveryKey: string,
): Promise<EncryptedEnvelope> {
  if (passphrase.length < 8)
    throw new Error("Use a passphrase with at least 8 characters");
  const data = bytes(32),
    salt = bytes(16),
    iv = bytes(12),
    passwordIv = bytes(12),
    recoveryIv = bytes(12);
  const key = await rawKey(data),
    passwordKey = await deriveKey(passphrase, salt),
    recovery = await rawKey(recoveryBytes(recoveryKey));
  const [ciphertext, passwordWrappedKey, recoveryWrappedKey] =
    await Promise.all([
      encrypt(key, iv, plaintext),
      encrypt(passwordKey, passwordIv, data),
      encrypt(recovery, recoveryIv, data),
    ]);
  data.fill(0);
  return {
    version: 1,
    algorithm: "AES-GCM",
    iterations: ITERATIONS,
    salt: encode(salt),
    iv: encode(iv),
    ciphertext: encode(ciphertext),
    passwordIv: encode(passwordIv),
    passwordWrappedKey: encode(passwordWrappedKey),
    recoveryIv: encode(recoveryIv),
    recoveryWrappedKey: encode(recoveryWrappedKey),
  };
}
export async function unlockEnvelope(
  envelope: EncryptedEnvelope,
  credential: string,
  method: "passphrase" | "recovery" = "passphrase",
): Promise<CryptoKey> {
  validate(envelope);
  try {
    const key =
      method === "recovery"
        ? await rawKey(recoveryBytes(credential))
        : await deriveKey(
            credential,
            decode(envelope.salt),
            envelope.iterations,
          );
    const data = new Uint8Array(
      await decrypt(
        key,
        decode(
          method === "recovery" ? envelope.recoveryIv : envelope.passwordIv,
        ),
        decode(
          method === "recovery"
            ? envelope.recoveryWrappedKey
            : envelope.passwordWrappedKey,
        ),
      ),
    );
    const result = await rawKey(data);
    data.fill(0);
    return result;
  } catch {
    throw new Error("Unable to unlock. Check your passphrase or recovery key.");
  }
}
export async function encryptWithKey(
  plaintext: Uint8Array,
  key: CryptoKey,
  envelope: EncryptedEnvelope,
): Promise<EncryptedEnvelope> {
  validate(envelope);
  const iv = bytes(12);
  return {
    ...envelope,
    iv: encode(iv),
    ciphertext: encode(await encrypt(key, iv, plaintext)),
  };
}
export async function decryptWithKey(
  envelope: EncryptedEnvelope,
  key: CryptoKey,
): Promise<Uint8Array> {
  validate(envelope);
  try {
    return new Uint8Array(
      await decrypt(key, decode(envelope.iv), decode(envelope.ciphertext)),
    );
  } catch {
    throw new Error(
      "The encrypted document is damaged or the key does not match.",
    );
  }
}
export async function decryptBytes(
  envelope: EncryptedEnvelope,
  credential: string,
  method: "passphrase" | "recovery" = "passphrase",
): Promise<Uint8Array> {
  return decryptWithKey(
    envelope,
    await unlockEnvelope(envelope, credential, method),
  );
}
/** Recovery changes the passphrase without exposing the document or removing recovery access. */
export async function rewrapPassphrase(
  envelope: EncryptedEnvelope,
  recoveryKey: string,
  newPassphrase: string,
): Promise<EncryptedEnvelope> {
  validate(envelope);
  if (newPassphrase.length < 8)
    throw new Error("Use a passphrase with at least 8 characters");
  const recovery = await rawKey(recoveryBytes(recoveryKey));
  const raw = new Uint8Array(
    await decrypt(
      recovery,
      decode(envelope.recoveryIv),
      decode(envelope.recoveryWrappedKey),
    ),
  );
  const salt = bytes(16),
    passwordIv = bytes(12),
    passwordKey = await deriveKey(newPassphrase, salt);
  const passwordWrappedKey = encode(
    await encrypt(passwordKey, passwordIv, raw),
  );
  raw.fill(0);
  return {
    ...envelope,
    wrapVersion: Math.max(Date.now(), (envelope.wrapVersion ?? 0) + 1),
    iterations: ITERATIONS,
    salt: encode(salt),
    passwordIv: encode(passwordIv),
    passwordWrappedKey,
  };
}
export function currentEnvelope(
  envelopes: EncryptedEnvelope[],
): EncryptedEnvelope {
  if (!envelopes.length) throw new Error("Encrypted content is unavailable");
  return envelopes.reduce((latest, item) =>
    (item.wrapVersion ?? 0) >= (latest.wrapVersion ?? 0) ? item : latest,
  );
}

/** Ciphertext lives in the file store; the key and nonce live only inside the owning document. */
export async function encryptAttachment(
  plaintext: Uint8Array,
  id: string,
): Promise<{ bytes: Uint8Array; key: string; iv: string }> {
  const raw = bytes(32),
    iv = bytes(12),
    key = await rawKey(raw);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: source(iv),
      additionalData: source(
        new TextEncoder().encode(`VeloraDesk attachment v1:${id}`),
      ),
    },
    key,
    source(plaintext),
  );
  const encodedKey = encode(raw);
  raw.fill(0);
  return { bytes: new Uint8Array(ciphertext), key: encodedKey, iv: encode(iv) };
}
export async function decryptAttachment(
  ciphertext: Uint8Array,
  key: string,
  iv: string,
  id: string,
): Promise<Uint8Array> {
  const nonce = decode(iv);
  if (nonce.length !== 12) throw new Error("Invalid attachment nonce");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: source(nonce),
        additionalData: source(
          new TextEncoder().encode(`VeloraDesk attachment v1:${id}`),
        ),
      },
      await rawKey(decode(key)),
      source(ciphertext),
    ),
  );
}
