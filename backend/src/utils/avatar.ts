// Location: backend/src/utils/avatar.ts
// Each participant gets a colour + emoji. Their avatar appears on every item
// they claim, so colours must be distinct and readable with white text.
export const AVATAR_COLORS = [
  "#F97316", // orange
  "#8B5CF6", // violet
  "#10B981", // emerald
  "#EF4444", // red
  "#3B82F6", // blue
  "#EC4899", // pink
  "#EAB308", // yellow
  "#14B8A6", // teal
  "#6366F1", // indigo
  "#84CC16", // lime
  "#F43F5E", // rose
  "#0EA5E9", // sky
] as const;

export const AVATAR_EMOJIS = ["🍕", "🌮", "🍜", "🍔", "🥟", "🍩", "🍣", "🥗", "🍛", "🧋", "🍦", "🥨"] as const;

/**
 * The n-th person to join gets the n-th colour, so the first 12 people never
 * share one. The emoji is offset so colour and emoji don't always pair the same way.
 */
export function pickAvatar(index: number) {
  return {
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length]!,
    avatarEmoji: AVATAR_EMOJIS[(index * 5) % AVATAR_EMOJIS.length]!,
  };
}
