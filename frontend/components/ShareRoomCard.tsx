"use client";
// Location: frontend/components/ShareRoomCard.tsx
// Host shows this to the table: big code + QR. Share button uses the phone's
// native share sheet (WhatsApp etc.), or copies the link on desktop.
import { api } from "@/lib/api";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

export function ShareRoomCard({ code, joinUrl, restaurant }: { code: string; joinUrl: string; restaurant: string | null }) {
  const toast = useToast();

  async function share() {
    const text = `Join the bill split${restaurant ? ` for ${restaurant}` : ""} on SplitSmart (code ${code})`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "SplitSmart", text, url: joinUrl });
      } catch {
        /* user closed the share sheet */
      }
      return;
    }
    await navigator.clipboard.writeText(joinUrl);
    toast("Link copied", "success");
  }

  return (
    <div className="card flex flex-col items-center p-6 text-center">
      <p className="eyebrow">Friends scan this to join</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={api.qrUrl(code)} alt={`QR code to join room ${code}`} width={208} height={208} className="my-4 h-52 w-52" />
      <p className="text-sm text-muted">or go to SplitSmart and type</p>
      <p className="mt-1.5 font-mono text-3xl font-semibold tracking-[0.3em]">{code}</p>
      <button onClick={share} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-wash">
        <Icon name="share" className="h-4 w-4 text-muted" />
        Share invite link
      </button>
    </div>
  );
}
