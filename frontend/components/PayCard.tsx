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
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-3xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200"
      >
        <div className="text-4xl">✅</div>
        <p className="mt-1 text-lg font-bold text-emerald-800">You&apos;re all paid up</p>
        <p className="text-sm text-emerald-700">
          {payee.name} confirmed {formatINR(payment.amount)}. Thanks!
        </p>
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
    <div className="rounded-3xl bg-stone-900 p-5 text-white">
      <p className="text-sm text-stone-300">You owe {payee.name}</p>
      <p className="text-4xl font-extrabold tabular-nums">{formatINR(payment.amount)}</p>

      {phone && (
        <motion.a
          whileTap={{ scale: 0.97 }}
          href={payment.upiLink}
          onClick={() => setTapped(true)}
          className="mt-4 flex min-h-14 items-center justify-center rounded-2xl bg-orange-500 text-lg font-bold shadow-lg shadow-orange-500/30"
        >
          Pay {formatINR(payment.amount)} with UPI
        </motion.a>
      )}

      <AnimatePresence>
        {tapped && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 text-center text-sm text-stone-300">
            Paid? {payee.name} will tick you off once it shows in their bank app.
            <br />
            App didn&apos;t open? Use the QR or copy the UPI ID below.
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-3 flex gap-2">
        <button onClick={() => setShowQr((s) => !s)} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-semibold">
          {showQr ? "Hide QR" : "Show QR"}
        </button>
        <button onClick={copyUpi} className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm font-semibold">
          Copy UPI ID
        </button>
      </div>

      <AnimatePresence>
        {showQr && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-4 flex flex-col items-center rounded-2xl bg-white p-4 text-stone-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.payQrUrl(code, payment.participantId, payment.amount)}
                alt={`UPI QR to pay ${payee.name} ${formatINR(payment.amount)}`}
                width={208}
                height={208}
                className="h-52 w-52"
              />
              <p className="mt-2 text-center text-sm text-stone-600">
                {phone ? "Scan from another phone with any UPI app" : "Scan with GPay, PhonePe, Paytm or any UPI app"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-3 text-center text-xs break-all text-stone-400">UPI ID: {payee.upiId}</p>
    </div>
  );
}
