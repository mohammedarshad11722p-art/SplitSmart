// Location: frontend/lib/validation.ts
// Same rules as the backend (rooms.routes.ts), checked early for instant feedback.
// The backend still validates: never trust the browser.
export const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export const ROOM_CODE_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export function cleanName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}
