"use client";
// Location: frontend/components/ShareRoomCard.tsx
// Host shows this to the table: big code + QR. Share button uses the phone's
// native share sheet (WhatsApp etc.), or copies the link on desktop.
import { api } from "@/lib/api";
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
    <div className="flex flex-col items-center rounded-3xl bg-white p-5 text-center ring-1 ring-stone-100">
      <p className="text-sm text-stone-500">Friends scan this to join</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={api.qrUrl(code)} alt={`QR code to join room ${code}`} width={208} height={208} className="my-3 h-52 w-52" />
      <p className="text-sm text-stone-500">or go to SplitSmart and type</p>
      <p className="mt-1 font-mono text-4xl font-bold tracking-[0.25em]">{code}</p>
      <button onClick={share} className="mt-4 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white">
        Share invite link
      </button>
    </div>
  );
}
