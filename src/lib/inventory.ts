import { db } from "./db";
import { nextNumber } from "./numbering";

/** Stock-in (purchase / opening). Updates weighted-average cost; creates or tops up a batch when tracked. */
export async function receiveStock(input: {
  productId: number; qty: number; unitCost: number; batchCode?: string; expiryDate?: Date | null; supplierId?: number | null; supplierRef?: string; note?: string; purchaseId?: number;
}) {
  if (!(input.qty > 0)) throw new Error("Quantity must be positive");
  if (input.unitCost < 0) throw new Error("Unit cost cannot be negative");
  return db.$transaction(async (tx) => {
    const p = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    let batchId: number | null = null;
    if (p.requireBatch && !input.batchCode) throw new Error(`${p.name} is batch tracked — enter a batch code`);
    if (input.batchCode) {
      const expiry = input.expiryDate ?? (p.shelfLifeDays ? new Date(Date.now() + p.shelfLifeDays * 864e5) : null);
      const b = await tx.batch.upsert({
        where: { productId_code: { productId: p.id, code: input.batchCode } },
        update: { qtyIn: { increment: input.qty }, qtyOnHand: { increment: input.qty }, unitCost: input.unitCost },
        create: { productId: p.id, code: input.batchCode, qtyIn: input.qty, qtyOnHand: input.qty, unitCost: input.unitCost, expiryDate: expiry, supplierId: input.supplierId ?? null, supplierRef: input.supplierRef },
      });
      batchId = b.id;
    }
    const total = p.qtyOnHand + input.qty;
    const avg = total > 0 ? (p.avgCost * p.qtyOnHand + input.unitCost * input.qty) / total : input.unitCost;
    await tx.product.update({ where: { id: p.id }, data: { qtyOnHand: total, avgCost: avg } });
    await tx.stockMove.create({ data: { type: "PURCHASE", productId: p.id, qty: input.qty, unitCost: input.unitCost, batchId, note: input.note } });
    if (input.purchaseId) await tx.purchaseRequest.update({ where: { id: input.purchaseId }, data: { status: "RECEIVED" } });
  });
}

/** Manual correction (count difference, damage…). Negative deltas can't exceed stock. */
export async function adjustStock(input: { productId: number; delta: number; note: string; batchId?: number | null }) {
  if (!input.delta) throw new Error("Adjustment cannot be zero");
  if (!input.note.trim()) throw new Error("A reason is required");
  return db.$transaction(async (tx) => {
    const p = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    if (p.qtyOnHand + input.delta < 0) throw new Error("Adjustment would make stock negative");
    if (input.batchId) {
      const b = await tx.batch.findUniqueOrThrow({ where: { id: input.batchId } });
      if (b.productId !== p.id) throw new Error("Batch belongs to another product");
      if (b.qtyOnHand + input.delta < 0) throw new Error("Adjustment would make the batch negative");
      await tx.batch.update({ where: { id: b.id }, data: { qtyOnHand: { increment: input.delta } } });
    } else if (p.requireBatch) throw new Error(`${p.name} is batch tracked — choose the batch to adjust`);
    await tx.product.update({ where: { id: p.id }, data: { qtyOnHand: { increment: input.delta } } });
    await tx.stockMove.create({ data: { type: "ADJUST", productId: p.id, qty: input.delta, unitCost: p.avgCost, batchId: input.batchId ?? null, note: input.note } });
  });
}

export async function createPurchaseRequest(input: { productId: number; qty: number; orderId?: number | null; supplierId?: number | null; remark?: string }) {
  if (!(input.qty > 0)) throw new Error("Quantity must be positive");
  const last = await db.purchaseRequest.findFirst({ orderBy: { no: "desc" } });
  return db.purchaseRequest.create({
    data: { no: nextNumber("PRQ", last?.no), productId: input.productId, qty: input.qty, orderId: input.orderId ?? null, supplierId: input.supplierId ?? null, remark: input.remark },
  });
}
