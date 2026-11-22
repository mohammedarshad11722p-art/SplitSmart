// Location: frontend/lib/storage.ts
// The browser remembers the secret tokens the backend gave us:
//  - host token: proves "I created this bill" (edit items, finalize...)
//  - session token: proves "I'm Priya in room K7P2QX" (claim items)
// localStorage survives refreshes and closing the tab, which is exactly
// what makes "rejoin as the same person" work.
// Every access is wrapped in try/catch: private browsing can block storage.

const keys = {
  hostByBill: (billId: string) => `splitsmart:host:bill:${billId}`,
  hostByRoom: (code: string) => `splitsmart:host:room:${code}`,
  session: (code: string) => `splitsmart:session:${code}`,
  lastName: "splitsmart:lastName",
  lastUpi: "splitsmart:lastUpi",
};

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the app still works until refresh */
  }
}
function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const storage = {
  getHostTokenForBill: (billId: string) => get(keys.hostByBill(billId)),
  setHostTokenForBill: (billId: string, token: string) => set(keys.hostByBill(billId), token),
  getHostTokenForRoom: (code: string) => get(keys.hostByRoom(code)),
  setHostTokenForRoom: (code: string, token: string) => set(keys.hostByRoom(code), token),
  getSession: (code: string) => get(keys.session(code)),
  setSession: (code: string, token: string) => set(keys.session(code), token),
  clearSession: (code: string) => remove(keys.session(code)),
  getLastName: () => get(keys.lastName) ?? "",
  setLastName: (name: string) => set(keys.lastName, name),
  getLastUpi: () => get(keys.lastUpi) ?? "",
  setLastUpi: (upi: string) => set(keys.lastUpi, upi),
};
