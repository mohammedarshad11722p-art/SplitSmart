// Location: backend/src/services/roomLock.ts
// One shared lock for everything that changes a room's claims or status.
// Claims and finalize use the SAME lock, so a tap can't sneak in while the
// host is finalizing (which would make the saved amounts wrong).
import { KeyedLock } from "../utils/keyedLock";

export const roomLock = new KeyedLock();
