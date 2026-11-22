// Location: backend/src/utils/hostToken.ts
// No-login host authentication.
// The host's browser gets a random secret once. We store only its SHA-256 hash,
// so even someone reading the database can't impersonate the host.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes ≈ 256 bits of entropy: impossible to guess. */
export function generateHostToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHostToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, so attackers can't learn the hash byte by byte from response timing. */
export function verifyHostToken(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashHostToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
