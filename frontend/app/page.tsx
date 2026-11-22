"use client";
// Location: frontend/app/page.tsx
// Home: the host snaps or picks a bill photo. We compress it, upload it, and
// the backend's AI reads it. Then we go to the edit screen.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
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
      <section className="pt-10 pb-10">
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Bill splitting, minus the maths
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-5 text-[40px] leading-[1.05] font-semibold tracking-tight"
        >
          Snap the bill.
          <br />
          Tap what you ate.
          <br />
          <span className="text-accent">Done.</span>
        </motion.h1>
        <p className="mt-5 text-[17px] leading-relaxed text-muted">
          AI reads the bill, friends join with a QR code, and everyone gets their exact share with a UPI link.
        </p>
      </section>

      <AnimatePresence mode="wait">
        {busy ? (
          <motion.div
            key="busy"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card flex flex-col items-center gap-3 p-8 text-center"
          >
            <Spinner className="h-7 w-7 text-accent" />
            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-1 font-semibold"
              >
                {READING_MESSAGES[messageIndex]}
              </motion.p>
            </AnimatePresence>
            <p className="text-sm text-muted">This usually takes 5-10 seconds</p>
          </motion.div>
        ) : (
          <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2.5">
            {/* capture="environment" opens the back camera directly on phones */}
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />

            <Button full onClick={() => cameraInput.current?.click()} className="min-h-14">
              <Icon name="camera" />
              Snap the bill
            </Button>
            <Button full variant="secondary" onClick={() => galleryInput.current?.click()}>
              <Icon name="image" className="h-5 w-5 text-muted" />
              Choose a photo
            </Button>
            <Button full variant="ghost" loading={manualBusy} onClick={startManual}>
              {!manualBusy && <Icon name="pencil" className="h-4 w-4" />}
              Type the items instead
            </Button>

            <p className="pt-5 text-center text-sm text-muted">
              Friend already started one?{" "}
              <Link href="/join" className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-4 hover:decoration-accent">
                Join with a code
              </Link>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="mt-14">
        <p className="eyebrow mb-3">How it works</p>
        <ol className="card divide-y divide-line">
          {[
            "Host snaps the bill, AI lists every item",
            "Friends scan the QR, no app or signup",
            "Everyone taps what they ate, live",
            "Exact shares with tax, paid by UPI",
          ].map((text, i) => (
            <li key={text} className="flex items-center gap-4 px-4 py-3.5 text-sm">
              <span className="w-5 font-mono text-xs text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-ink/80">{text}</span>
            </li>
          ))}
        </ol>
      </section>
    </PageShell>
  );
}
