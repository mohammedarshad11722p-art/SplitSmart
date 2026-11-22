"use client";
// Location: frontend/components/Avatar.tsx
import { AnimatePresence, motion } from "motion/react";
import type { Participant } from "@/lib/types";

const sizes = { sm: "h-7 w-7 text-sm", md: "h-9 w-9 text-base", lg: "h-12 w-12 text-xl" };

export function Avatar({
  person,
  size = "md",
  online,
  ring,
}: {
  person: Pick<Participant, "name" | "avatarColor" | "avatarEmoji">;
  size?: keyof typeof sizes;
  online?: boolean;
  ring?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        title={person.name}
        className={`inline-flex items-center justify-center rounded-full font-semibold text-white ${sizes[size]} ${ring ? "ring-2 ring-white" : ""}`}
        style={{ backgroundColor: person.avatarColor }}
      >
        {person.avatarEmoji ?? person.name.charAt(0).toUpperCase()}
      </span>
      {online !== undefined && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-white ${online ? "bg-emerald-500" : "bg-faint"}`}
          aria-label={online ? "online" : "offline"}
        />
      )}
    </span>
  );
}

/** Overlapping avatars of everyone who claimed an item. New ones pop in. */
export function AvatarStack({ people, max = 5 }: { people: Participant[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      <AnimatePresence initial={false}>
        {shown.map((p) => (
          <motion.span
            key={p.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            <Avatar person={p} size="sm" ring />
          </motion.span>
        ))}
      </AnimatePresence>
      {extra > 0 && (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-wash text-xs font-semibold text-muted ring-2 ring-white">
          +{extra}
        </span>
      )}
    </div>
  );
}
