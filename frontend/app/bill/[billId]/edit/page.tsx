"use client";
// Location: frontend/app/bill/[billId]/edit/page.tsx
// Host reviews what the AI read, fixes mistakes, then starts the room.
import { AnimatePresence } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ItemEditor, type ItemDraft } from "@/components/ItemEditor";
import { MoneyInput } from "@/components/MoneyInput";
import { CenteredMessage, PageShell } from "@/components/PageShell";
import { Sheet } from "@/components/Sheet";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { ApiError, api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { storage } from "@/lib/storage";
import type { Bill } from "@/lib/types";
import { UPI_REGEX, cleanName } from "@/lib/validation";

type Charge = "tax" | "serviceCharge" | "discount" | "subtotal" | "grandTotal";

export default function EditBillPage() {
  const { billId } = useParams<{ billId: string }>();
  const router = useRouter();
  const toast = useToast();
  const [bill, setBill] = useState<Bill | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [adding, setAdding] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  useEffect(() => {
    setHostToken(storage.getHostTokenForBill(billId));
    api
      .getBill(billId)
      .then(({ bill }) => setBill(bill))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load the bill"));
  }, [billId]);

  /** Runs an API call that returns the updated bill; shows errors as toasts. */
  const mutate = useCallback(
    async (call: () => Promise<{ bill: Bill }>) => {
      try {
        const { bill } = await call();
        setBill(bill);
      } catch (err) {
        if (err instanceof ApiError && err.code === "BILL_LOCKED") toast("This split is already finalized", "error");
        else toast(err instanceof ApiError ? err.message : "Couldn't save", "error");
        throw err;
      }
    },
    [toast],
  );

  if (loadError) return <PageShell><CenteredMessage emoji="😕" title="Bill not found">{loadError}</CenteredMessage></PageShell>;
  if (!bill) return <PageShell><div className="flex justify-center pt-24"><Spinner className="h-6 w-6 text-faint" /></div></PageShell>;
  if (!hostToken) {
    return (
      <PageShell>
        <CenteredMessage emoji="🔒" title="Only the host can edit this bill">
          Open this page on the phone that uploaded the bill.
        </CenteredMessage>
      </PageShell>
    );
  }

  const v = bill.validation;
  const printedTotals = bill.parseStatus === "PARSED";
  const updateCharge = (field: Charge, paise: number | null) => {
    if (paise === null || paise === bill[field]) return;
    mutate(() => api.updateBill(bill.id, hostToken, { [field]: paise })).catch(() => {});
  };

  return (
    <PageShell
      bottomBar={
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="eyebrow">Bill total</div>
            <div className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums">{formatINR(bill.grandTotal)}</div>
          </div>
          <Button onClick={() => setStartOpen(true)} disabled={bill.items.length === 0}>
            Start the split →
          </Button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-4 pt-6">
        <div className="min-w-0">
          <input
            aria-label="Restaurant name"
            defaultValue={bill.restaurantName ?? ""}
            placeholder="Restaurant name"
            onBlur={(e) => {
              const name = e.target.value.trim() || null;
              if (name !== bill.restaurantName) mutate(() => api.updateBill(bill.id, hostToken, { restaurantName: name })).catch(() => {});
            }}
            className="w-full bg-transparent text-[28px] font-semibold tracking-tight outline-none placeholder:text-line"
          />
          <p className="mt-0.5 text-sm text-muted">Check the items, then start the split.</p>
        </div>
        {bill.imageUrl && (
          <button onClick={() => setShowPhoto(true)} className="shrink-0 overflow-hidden rounded-xl border border-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bill.imageUrl} alt="Bill photo" className="h-14 w-14 object-cover" />
          </button>
        )}
      </div>

      {/* Warnings */}
      <div className="mt-5 space-y-2">
        {bill.parseStatus === "FAILED" && (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
            We couldn&apos;t read the photo. Add the items below, it only takes a minute.
          </div>
        )}
        {printedTotals && !v.itemsMatchSubtotal && (
          <div className="rounded-xl border border-red-200/70 bg-red-50/60 px-4 py-3 text-sm text-red-900">
            <strong>Items don&apos;t add up.</strong> They total {formatINR(v.itemsSum)}, but the bill&apos;s subtotal is{" "}
            {formatINR(bill.subtotal)} ({v.itemsDiff > 0 ? "+" : "−"}
            {formatINR(Math.abs(v.itemsDiff))}). A price was probably misread: compare with the photo.
          </div>
        )}
        {printedTotals && v.itemsMatchSubtotal && bill.items.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Icon name="check" className="h-4 w-4" strokeWidth={2.25} /> Items match the bill&apos;s subtotal.
          </div>
        )}
      </div>

      {/* Items */}
      <h2 className="eyebrow mt-8 mb-3">Items ({bill.items.length})</h2>
      <ul className="card divide-y divide-line overflow-hidden">
        <AnimatePresence initial={false}>
          {bill.items.map((item) => (
            <ItemEditor
              key={item.id}
              item={item}
              onSave={(d: ItemDraft) => mutate(() => api.updateItem(bill.id, item.id, hostToken, d))}
              onDelete={() => mutate(() => api.deleteItem(bill.id, item.id, hostToken))}
            />
          ))}
        </AnimatePresence>
      </ul>
      {adding ? (
        <AddItemForm
          onCancel={() => setAdding(false)}
          onAdd={async (d) => {
            await mutate(() => api.addItem(bill.id, hostToken, d));
            setAdding(false);
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-faint/70 py-3 text-sm font-medium text-muted transition-colors hover:border-ink hover:text-ink"
        >
          + Add item
        </button>
      )}

      {/* Charges */}
      <h2 className="eyebrow mt-10 mb-3">Charges</h2>
      <div className="card space-y-2.5 p-4">
        {printedTotals && <ChargeRow label="Subtotal (as printed)" value={bill.subtotal} onChange={(p) => updateCharge("subtotal", p)} />}
        <ChargeRow label="Tax (GST etc.)" value={bill.tax} onChange={(p) => updateCharge("tax", p)} />
        <ChargeRow label="Service charge" value={bill.serviceCharge} onChange={(p) => updateCharge("serviceCharge", p)} />
        <ChargeRow label="Discount" value={bill.discount} onChange={(p) => updateCharge("discount", p)} />
        {printedTotals ? (
          <ChargeRow label="Grand total (as printed)" value={bill.grandTotal} onChange={(p) => updateCharge("grandTotal", p)} bold />
        ) : (
          <div className="flex items-center justify-between border-t border-line pt-3 font-semibold">
            <span>Grand total</span>
            <span className="tabular-nums">{formatINR(bill.grandTotal)}</span>
          </div>
        )}
        {printedTotals && !v.grandTotalMatches && (
          <p className="text-xs leading-relaxed text-muted">
            Charges add up to {formatINR(v.computedGrandTotal)}; the printed total differs by {formatINR(Math.abs(v.grandTotalDiff))}{" "}
            (usually a round-off). It&apos;s shared fairly in the split.
          </p>
        )}
      </div>

      <Sheet open={showPhoto} onClose={() => setShowPhoto(false)} title="Bill photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {bill.imageUrl && <img src={bill.imageUrl} alt="Bill photo" className="w-full rounded-xl border border-line" />}
      </Sheet>

      <StartRoomSheet
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onStart={async (hostName, hostUpiId) => {
          try {
            const { sessionToken, state } = await api.createRoom(hostToken, { billId: bill.id, hostName, hostUpiId });
            const code = state.room.code;
            storage.setSession(code, sessionToken);
            storage.setHostTokenForRoom(code, hostToken);
            storage.setLastName(hostName);
            storage.setLastUpi(hostUpiId);
            router.push(`/room/${code}`);
          } catch (err) {
            // Already has a room (e.g. host pressed back): just go there.
            const existing = err instanceof ApiError && err.code === "ROOM_EXISTS" ? (err.details as { code?: string })?.code : undefined;
            if (existing) {
              storage.setHostTokenForRoom(existing, hostToken);
              router.push(`/room/${existing}`);
              return;
            }
            toast(err instanceof ApiError ? err.message : "Couldn't create the room", "error");
          }
        }}
      />
    </PageShell>
  );
}

function ChargeRow({ label, value, onChange, bold }: { label: string; value: number; onChange: (p: number | null) => void; bold?: boolean }) {
  const [draft, setDraft] = useState<number | null>(value);
  return (
    <div className={`flex items-center justify-between gap-3 ${bold ? "border-t border-line pt-3 font-semibold" : ""}`}>
      <span className={`text-sm ${bold ? "" : "text-ink/80"}`}>{label}</span>
      <div onBlur={() => onChange(draft)} className="w-36">
        <MoneyInput label={label} value={value} onChange={setDraft} />
      </div>
    </div>
  );
}

function AddItemForm({ onAdd, onCancel }: { onAdd: (d: ItemDraft) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0 && price !== null && price > 0;

  return (
    <form
      className="card mt-2.5 space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        try {
          await onAdd({ name: name.trim(), quantity, unitPrice: price! });
        } catch {
          setBusy(false);
        }
      }}
    >
      <input
        autoFocus
        placeholder="Item name, e.g. Masala Dosa"
        aria-label="New item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field py-2.5"
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={999}
          aria-label="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
          className="field w-16 px-2 py-2.5 text-center"
        />
        <span className="text-faint">×</span>
        <MoneyInput label="New item price" value={0} onChange={setPrice} className="flex-1" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink">
          Cancel
        </button>
        <button type="submit" disabled={!valid || busy} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </div>
    </form>
  );
}

function StartRoomSheet({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: (name: string, upi: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [upi, setUpi] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName((n) => n || storage.getLastName());
      setUpi((u) => u || storage.getLastUpi());
    }
  }, [open]);
  const upiValid = UPI_REGEX.test(upi.trim());
  const valid = cleanName(name).length > 0 && upiValid;

  return (
    <Sheet open={open} onClose={onClose} title="Start the split">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          await onStart(cleanName(name), upi.trim());
          setBusy(false);
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Arshad"
            className="field"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Your UPI ID</span>
          <input
            value={upi}
            onChange={(e) => setUpi(e.target.value)}
            placeholder="name@okaxis"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="field"
          />
          <span className={`mt-1.5 block text-xs ${upi && !upiValid ? "text-red-600" : "text-muted"}`}>
            {upi && !upiValid ? "That doesn't look like a UPI ID (name@bank)" : "Friends pay you here. Find it in GPay / PhonePe / Paytm → Profile."}
          </span>
        </label>
        <Button full type="submit" disabled={!valid} loading={busy}>
          Create room
        </Button>
      </form>
    </Sheet>
  );
}
