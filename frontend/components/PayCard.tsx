"use client";
// Location: frontend/components/PayCard.tsx
// "You owe Arshad ₹315": the big Pay button for the person looking at the summary.
// On a phone it opens their UPI app with everything filled in. On a laptop
// it shows the QR to scan with their phone instead.
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isPhone } from "@/lib/device";
import { formatINR } from "@/lib/format";
import type { PaymentsView, PersonPayment } from "@/lib/types";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

export function PayCard({ code, payment, payee }: { code: string; payment: PersonPayment; payee: PaymentsView["payee"] }) {
  const toast = useToast();
  const [phone, setPhone] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [tapped, setTapped] = useState(false);

  useEffect(() => {
    const p = isPhone();
    setPhone(p);
    setShowQr(!p); // laptop: QR straight away
  }, []);

  if (payment.status === "PAID") {
    return (
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card flex items-center gap-4 p-5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Icon name="check" className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <div>
        <p className="font-semibold">You&apos;re all paid up</p>
        <p className="text-sm text-muted">
          {payee.name} confirmed {formatINR(payment.amount)}. Thanks!
        </p>
        </div>
      </motion.div>
    );
  }
  if (payment.status !== "PENDING" || !payment.upiLink) return null;

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(payee.upiId);
      toast("UPI ID copied", "success");
    } catch {
      toast(payee.upiId);
    }
  }

  return (
    <div className="card p-5">
      <p className="eyebrow">You owe {payee.name}</p>
      <p className="mt-1.5 text-[40px] leading-none font-semibold tracking-tight tabular-nums">{formatINR(payment.amount)}</p>

      {phone && (
        <motion.a
          whileTap={{ scale: 0.97 }}
          href={payment.upiLink}
          onClick={() => setTapped(true)}
          className="mt-5 flex min-h-13 items-center justify-center gap-2 rounded-xl bg-ink py-3.5 text-[15px] font-semibold text-white"
        >
          Pay {formatINR(payment.amount)} with UPI
        </motion.a>
      )}

      <AnimatePresence>
        {tapped && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 text-center text-sm leading-relaxed text-muted">
            Paid? {payee.name} will tick you off once it shows in their bank app.
            <br />
            App didn&apos;t open? Use the QR or copy the UPI ID below.
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-3 flex gap-2">
        <button onClick={() => setShowQr((s) => !s)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-wash">
          <Icon name="qr" className="h-4 w-4 text-muted" />
          {showQr ? "Hide QR" : "Show QR"}
        </button>
        <button onClick={copyUpi} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-wash">
          <Icon name="copy" className="h-4 w-4 text-muted" />
          Copy UPI ID
        </button>
      </div>

      <AnimatePresence>
        {showQr && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-4 flex flex-col items-center rounded-xl bg-wash/60 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.payQrUrl(code, payment.participantId, payment.amount)}
                alt={`UPI QR to pay ${payee.name} ${formatINR(payment.amount)}`}
                width={208}
                height={208}
                className="h-48 w-48 rounded-lg bg-white p-2 mix-blend-multiply"
              />
              <p className="mt-3 text-center text-sm text-muted">
                {phone ? "Scan from another phone with any UPI app" : "Scan with GPay, PhonePe, Paytm or any UPI app"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-4 text-center font-mono text-xs break-all text-faint">{payee.upiId}</p>
    </div>
  );
}
