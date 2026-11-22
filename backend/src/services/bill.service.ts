// Location: backend/src/services/bill.service.ts
// Business logic for bills. Routes call these functions; these functions talk
// to the database, Cloudinary and the AI. No req/res objects in here.
import type { Bill, Item, Prisma } from "@prisma/client";
import { env } from "../config/env";
import { getBillParser, BillParseError } from "../lib/ai";
import { uploadBillImage } from "../lib/cloudinary";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { generateToken, hashToken } from "../utils/tokens";
import { checkTotals, normalizeParsedBill, sumItems, type BillTotals, type TotalsCheck } from "./billMath";

type BillWithItems = Bill & { items: Item[] };

/** What the API returns. Never includes hostTokenHash or the raw AI dump. */
export interface BillDto {
  id: string;
  imageUrl: string | null;
  restaurantName: string | null;
  currency: string;
  parseStatus: Bill["parseStatus"];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  grandTotal: number;
  items: Array<Pick<Item, "id" | "name" | "quantity" | "unitPrice" | "total" | "position">>;
  validation: TotalsCheck;
  createdAt: Date;
}

export function toBillDto(bill: BillWithItems): BillDto {
  const items = [...bill.items].sort((a, b) => a.position - b.position);
  return {
    id: bill.id,
    imageUrl: bill.imageUrl,
    restaurantName: bill.restaurantName,
    currency: bill.currency,
    parseStatus: bill.parseStatus,
    subtotal: bill.subtotal,
    tax: bill.tax,
    serviceCharge: bill.serviceCharge,
    discount: bill.discount,
    grandTotal: bill.grandTotal,
    items: items.map(({ id, name, quantity, unitPrice, total, position }) => ({
      id, name, quantity, unitPrice, total, position,
    })),
    validation: checkTotals(bill, items),
    createdAt: bill.createdAt,
  };
}

/**
 * Host uploads a photo:
 *  1. upload to Cloudinary
 *  2. create the Bill row (PENDING) with a fresh host token
 *  3. ask the AI to read it
 *  4. save items + totals (PARSED), or mark FAILED so the host can type items in
 * The host token is returned ONCE; only its hash is stored.
 */
export async function createBillFromImage(fileBuffer: Buffer) {
  // With AI_PROVIDER=mock and no Cloudinary keys we skip the upload, so the
  // backup demo works fully offline. (env.ts requires Cloudinary for Claude.)
  const image = env.cloudinaryConfigured ? await uploadBillImage(fileBuffer) : null;
  const hostToken = generateToken();

  const bill = await prisma.bill.create({
    data: {
      imageUrl: image?.url ?? null,
      imagePublicId: image?.publicId ?? null,
      hostTokenHash: hashToken(hostToken),
      parseStatus: "PENDING",
    },
  });

  const parser = getBillParser();
  let parseError: string | null = null;

  try {
    const parsed = await parser.parse(image?.aiUrl ?? "mock://no-image");
    const normalized = normalizeParsedBill(parsed);
    const check = checkTotals(normalized.totals, normalized.items);

    // Transaction: items and totals are saved together or not at all.
    await prisma.$transaction([
      prisma.item.createMany({
        data: normalized.items.map((it, index) => ({ ...it, billId: bill.id, position: index })),
      }),
      prisma.bill.update({
        where: { id: bill.id },
        data: {
          ...normalized.totals,
          restaurantName: normalized.restaurantName,
          parseStatus: "PARSED",
          rawAiResponse: { provider: parser.name, output: parsed } as Prisma.InputJsonValue,
          hasMismatch: !check.itemsMatchSubtotal,
          mismatchAmount: check.itemsDiff,
        },
      }),
    ]);
  } catch (err) {
    parseError = err instanceof BillParseError ? err.message : "Could not read the bill";
    console.error(`AI parse failed for bill ${bill.id}:`, err);
    await prisma.bill.update({
      where: { id: bill.id },
      data: {
        parseStatus: "FAILED",
        rawAiResponse: { provider: parser.name, error: String((err as Error)?.message ?? err) },
      },
    });
  }

  return { hostToken, parseError, bill: await getBill(bill.id) };
}

/** Plan B: host skips the photo and types items in. */
export async function createManualBill(restaurantName?: string) {
  const hostToken = generateToken();
  const bill = await prisma.bill.create({
    data: { hostTokenHash: hashToken(hostToken), parseStatus: "MANUAL", restaurantName: restaurantName ?? null },
    include: { items: true },
  });
  return { hostToken, bill: toBillDto(bill) };
}

export async function getBill(billId: string): Promise<BillDto> {
  const bill = await prisma.bill.findUnique({ where: { id: billId }, include: { items: true } });
  if (!bill) throw new AppError(404, "BILL_NOT_FOUND", "Bill not found");
  return toBillDto(bill);
}

/** Items can't change once the split is finalized, or amounts already sent would be wrong. */
async function assertEditable(billId: string) {
  const bill = await prisma.bill.findUnique({ where: { id: billId }, include: { room: true } });
  if (!bill) throw new AppError(404, "BILL_NOT_FOUND", "Bill not found");
  if (bill.room && bill.room.status !== "OPEN") {
    throw new AppError(409, "BILL_LOCKED", "This bill is finalized and can no longer be edited");
  }
}

/**
 * Re-run validation after any edit and store the mismatch flag.
 *
 * Bills with no printed totals (MANUAL, or FAILED when the AI couldn't read
 * the photo) have nothing to check against, so their subtotal and grand total
 * are CALCULATED from the items: subtotal = sum of items, grand total =
 * subtotal + tax + service − discount. (Added in step 6: without this, a
 * manual bill kept a grand total of ₹0 and the split said everyone owes ₹0.)
 */
async function refreshValidation(billId: string): Promise<BillDto> {
  const bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId }, include: { items: true } });

  const autoTotals = bill.parseStatus === "MANUAL" || bill.parseStatus === "FAILED";
  const totals = { subtotal: bill.subtotal, grandTotal: bill.grandTotal };
  if (autoTotals) {
    totals.subtotal = sumItems(bill.items);
    totals.grandTotal = Math.max(0, totals.subtotal + bill.tax + bill.serviceCharge - bill.discount);
  }

  const check = checkTotals({ ...bill, ...totals }, bill.items);
  const updated = await prisma.bill.update({
    where: { id: billId },
    data: { ...totals, hasMismatch: !check.itemsMatchSubtotal, mismatchAmount: check.itemsDiff },
    include: { items: true },
  });
  return toBillDto(updated);
}

export async function updateBillTotals(
  billId: string,
  patch: Partial<BillTotals> & { restaurantName?: string | null },
) {
  await assertEditable(billId);
  await prisma.bill.update({ where: { id: billId }, data: patch });
  return refreshValidation(billId);
}

export async function addItem(
  billId: string,
  input: { name: string; quantity: number; unitPrice: number; total?: number },
) {
  await assertEditable(billId);
  const last = await prisma.item.findFirst({ where: { billId }, orderBy: { position: "desc" } });
  await prisma.item.create({
    data: {
      billId,
      name: input.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      total: input.total ?? input.quantity * input.unitPrice,
      position: (last?.position ?? -1) + 1,
    },
  });
  return refreshValidation(billId);
}

export async function updateItem(
  billId: string,
  itemId: string,
  patch: { name?: string; quantity?: number; unitPrice?: number; total?: number },
) {
  await assertEditable(billId);
  const item = await prisma.item.findFirst({ where: { id: itemId, billId } });
  if (!item) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found on this bill");

  const quantity = patch.quantity ?? item.quantity;
  const unitPrice = patch.unitPrice ?? item.unitPrice;
  // If qty or price changed but no explicit total was sent, recompute it.
  const total =
    patch.total ??
    (patch.quantity !== undefined || patch.unitPrice !== undefined ? quantity * unitPrice : item.total);

  await prisma.item.update({
    where: { id: itemId },
    data: { name: patch.name ?? item.name, quantity, unitPrice, total },
  });
  return refreshValidation(billId);
}

export async function deleteItem(billId: string, itemId: string) {
  await assertEditable(billId);
  // deleteMany with billId filter = can't delete another bill's item by guessing ids.
  const { count } = await prisma.item.deleteMany({ where: { id: itemId, billId } });
  if (count === 0) throw new AppError(404, "ITEM_NOT_FOUND", "Item not found on this bill");
  return refreshValidation(billId);
}
