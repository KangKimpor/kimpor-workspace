import { describe, expect, it } from "vitest";
import {
  createRecoveryKey,
  decryptBytes,
  decryptWithKey,
  encryptBytes,
  encryptWithKey,
  rewrapPassphrase,
  unlockEnvelope,
} from "./crypto";
const text = new TextEncoder().encode("Private ខ្មែរ 中文 journal entry");
describe("encrypted document envelopes", () => {
  it("round-trips text with password and independent recovery and authenticates tampering", async () => {
    const recovery = createRecoveryKey(),
      envelope = await encryptBytes(text, "a strong passphrase", recovery);
    expect(JSON.stringify(envelope)).not.toContain("Private");
    expect(await decryptBytes(envelope, "a strong passphrase")).toEqual(text);
    expect(await decryptBytes(envelope, recovery, "recovery")).toEqual(text);
    await expect(decryptBytes(envelope, "wrong password")).rejects.toThrow(
      "Unable to unlock",
    );
    const damaged = {
      ...envelope,
      ciphertext: `${envelope.ciphertext[0] === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}`,
    };
    await expect(decryptBytes(damaged, recovery, "recovery")).rejects.toThrow(
      "damaged",
    );
  });
  it("saves with a fresh nonce and recovers into a new passphrase without changing recovery", async () => {
    const recovery = createRecoveryKey(),
      first = await encryptBytes(text, "original passphrase", recovery);
    const key = await unlockEnvelope(first, "original passphrase"),
      next = await encryptWithKey(new Uint8Array([1, 2, 3]), key, first);
    expect(next.iv).not.toBe(first.iv);
    expect(await decryptWithKey(next, key)).toEqual(new Uint8Array([1, 2, 3]));
    const changed = await rewrapPassphrase(
      next,
      recovery,
      "replacement passphrase",
    );
    expect(await decryptBytes(changed, "replacement passphrase")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(await decryptBytes(changed, recovery, "recovery")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(
      decryptBytes(changed, "original passphrase"),
    ).rejects.toThrow();
  });
  it("rejects short passwords and unsupported envelopes", async () => {
    await expect(
      encryptBytes(text, "short", createRecoveryKey()),
    ).rejects.toThrow("8 characters");
    await expect(
      unlockEnvelope({ version: 2 } as never, "password"),
    ).rejects.toThrow("Unsupported");
  });
});
