// Location: backend/src/utils/roomCode.ts
// 6-character room codes like "K7P2QX".
import { randomInt } from "node:crypto";

// No 0/O, 1/I/L: people read codes off a phone screen across a table and
// type them on another phone. Ambiguous characters cause "room not found".
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars
export const ROOM_CODE_LENGTH = 6;

/**
 * 31^6 ≈ 887 million possible codes. crypto.randomInt (not Math.random) so
 * codes can't be predicted from previous ones.
 */
export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Accepts " k7p2qx " from a user and returns "K7P2QX", or null if it can't be a code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  const valid = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
  return valid.test(code) ? code : null;
}
