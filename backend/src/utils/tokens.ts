// Location: backend/src/utils/tokens.ts
// (Renamed from hostToken.ts in step 4: guests now need tokens too, so the
//  helpers became generic. Refactor when the second use shows up, not before.)
//
// No-login authentication for hosts AND guests.
// The browser gets a random secret once. We store only its SHA-256 hash,
// so even someone reading the database can't impersonate anyone.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes ≈ 256 bits of entropy: impossible to guess. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 is deterministic: the same token always gives the same hash.
 * That lets us look a guest up by hash (WHERE sessionTokenHash = ...).
 * Plain SHA-256 (no bcrypt) is fine here because the token is random and
 * 256 bits long; nobody can brute-force it like a human password.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, so attackers can't learn the hash byte by byte from response timing. */
export function verifyToken(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
