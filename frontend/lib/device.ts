// Location: frontend/lib/device.ts
// upi:// links only work on phones that have a UPI app. On a laptop, tapping
// one does nothing, so there we show the QR code to scan with your phone instead.
export function isPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
