"use client";
// Location: frontend/app/page.tsx
// Home: the host snaps or picks a bill photo. We compress it, upload it, and
// the backend's AI reads it. Then we go to the edit screen.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { PageShell } from "@/components/PageShell";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { ApiError, api } from "@/lib/api";
import { compressImage } from "@/lib/image";
import { storage } from "@/lib/storage";

const READING_MESSAGES = ["Uploading your bill…", "Reading the items…", "Checking the maths…", "Almost there…"];

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  // Rotate the loading message so a 5-10 s AI call feels alive.
  useEffect(() => {
    if (!busy) return;
    setMessageIndex(0);
    const t = setInterval(() => setMessageIndex((i) => Math.min(i + 1, READING_MESSAGES.length - 1)), 2500);
    return () => clearInterval(t);
  }, [busy]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { blob, filename } = await compressImage(file);
      const { hostToken, bill, parseError } = await api.uploadBill(blob, filename);
      storage.setHostTokenForBill(bill.id, hostToken);
      if (parseError) toast(`${parseError}. You can add the items yourself.`, "error");
      router.push(`/bill/${bill.id}/edit`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Upload failed, please try again", "error");
      setBusy(false);
    }
  }

  async function startManual() {
    setManualBusy(true);
    try {
      const { hostToken, bill } = await api.createManualBill();
      storage.setHostTokenForBill(bill.id, hostToken);
      router.push(`/bill/${bill.id}/edit`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong", "error");
      setManualBusy(false);
    }
  }

  return (
    <PageShell>
      <section className="pt-8 pb-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-2 text-5xl">
          🧾✨
        </motion.div>
        <h1 className="text-4xl leading-tight font-extrabold tracking-tight">
          Snap the bill.
          <br />
          Tap what you ate.
          <br />
          <span className="text-orange-500">Done.</span>
        </h1>
        <p className="mt-4 text-lg text-stone-600">
          AI reads the bill, friends join with a QR code, and everyone gets their exact share with a UPI link.
        </p>
      </section>

      <AnimatePresence mode="wait">
        {busy ? (
          <motion.div
            key="busy"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-100"
          >
            <Spinner className="h-10 w-10 text-orange-500" />
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="text-lg font-semibold"
              >
                {READING_MESSAGES[messageIndex]}
              </motion.p>
            </AnimatePresence>
            <p className="text-sm text-stone-500">This usually takes 5-10 seconds</p>
          </motion.div>
        ) : (
          <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* capture="environment" opens the back camera directly on phones */}
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />

            <Button full onClick={() => cameraInput.current?.click()} className="min-h-16 text-lg">
              📸 Snap the bill
            </Button>
            <Button full variant="secondary" onClick={() => galleryInput.current?.click()}>
              🖼️ Choose a photo
            </Button>
            <Button full variant="ghost" loading={manualBusy} onClick={startManual}>
              ✍️ Type the items instead
            </Button>

            <div className="pt-6 text-center">
              <span className="text-stone-500">Friend already started one? </span>
              <Link href="/join" className="font-semibold text-orange-600 underline underline-offset-4">
                Join with a code
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ol className="mt-12 grid gap-3 text-sm text-stone-600">
        {[
          ["📸", "Host snaps the bill, AI lists every item"],
          ["📱", "Friends scan the QR, no app or signup"],
          ["👆", "Everyone taps what they ate, live"],
          ["💸", "Exact shares with tax, paid by UPI"],
        ].map(([icon, text]) => (
          <li key={text} className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-stone-100">
            <span className="text-xl">{icon}</span>
            {text}
          </li>
        ))}
      </ol>
    </PageShell>
  );
}
