import { db } from "./db";
import { explode, scale } from "./bom";
import { nextNumber } from "./numbering";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const pad = (n: number, w = 6) => String(n).padStart(w, "0");

async function nextNo(tx: Tx, prefix: string) {
  const last = await tx.productionOrder.findFirst({ orderBy: { no: "desc" } });
  return nextNumber(prefix, last?.no);
}

/** Plan = materials snapshot + planned labour (ops + equipment) + planned expenses. */
async function buildPlan(tx: Tx, bomId: number, qty: number) {
  const bom = await tx.bom.findUniqueOrThrow({
    where: { id: bomId },
    include: { materials: { include: { product: true } }, operations: { include: { expenses: true, assets: { include: { asset: true } } } } },
  });
  const plan = explode(bom.materials.map((m) => ({ ...m, unitCost: m.product.avgCost })), bom.operations, qty, bom.outputQty);
  const k = scale(qty, bom.outputQty);
  let equipmentCost = 0;
  let expenseCost = 0;
  for (const o of bom.operations) {
    for (const a of o.assets) equipmentCost += a.hours * a.asset.hourRate * k;
    for (const e of o.expenses) expenseCost += e.amountType === "RATIO" ? e.amount * k : e.amount;
  }
  return { bom, plan, laborCost: plan.laborCost + equipmentCost, expenseCost };
}

export interface OrderInput {
  bomId: number; qty: number; lineId?: number | null; requestId?: number; plannedEnd?: Date | null; plannedStart?: Date | null; priority?: number; remark?: string | null;
}

export async function createOrder(input: OrderInput) {
  return db.$transaction(async (tx) => {
    const { plan, laborCost, expenseCost } = await buildPlan(tx, input.bomId, input.qty);
    const line = input.lineId ? await tx.productionLine.findUnique({ where: { id: input.lineId } }) : null;
    return tx.productionOrder.create({
      data: {
        no: await nextNo(tx, "PO"),
        bomId: input.bomId, lineId: input.lineId ?? null, branchId: line?.branchId ?? null, requestId: input.requestId,
        priority: input.priority ?? 2, remark: input.remark ?? null,
        plannedStart: input.plannedStart ?? new Date(), plannedEnd: input.plannedEnd ?? null,
        plannedQty: input.qty,
        plannedMaterialCost: plan.materialCost, plannedLaborCost: laborCost, plannedExpenseCost: expenseCost,
        materials: { create: plan.materials.map((m) => ({ productId: m.productId, plannedQty: m.plannedQty, unitCost: m.unitCost, qtyType: m.qtyType, essential: m.essential })) },
      },
    });
  });
}

/** Edit a DRAFT order — the plan is rebuilt from the (possibly different) BOM/qty. */
export async function updateDraftOrder(id: number, input: OrderInput) {
  return db.$transaction(async (tx) => {
    const po = await tx.productionOrder.findUniqueOrThrow({ where: { id } });
    if (po.status !== "DRAFT") throw new Error("Only draft orders can be edited");
    const { plan, laborCost, expenseCost } = await buildPlan(tx, input.bomId, input.qty);
    const line = input.lineId ? await tx.productionLine.findUnique({ where: { id: input.lineId } }) : null;
    await tx.poMaterial.deleteMany({ where: { orderId: id } });
    return tx.productionOrder.update({
      where: { id },
      data: {
        bomId: input.bomId, lineId: input.lineId ?? null, branchId: line?.branchId ?? null,
        priority: input.priority ?? 2, remark: input.remark ?? null,
        plannedStart: input.plannedStart ?? po.plannedStart, plannedEnd: input.plannedEnd ?? null, plannedQty: input.qty,
        plannedMaterialCost: plan.materialCost, plannedLaborCost: laborCost, plannedExpenseCost: expenseCost,
        materials: { create: plan.materials.map((m) => ({ productId: m.productId, plannedQty: m.plannedQty, unitCost: m.unitCost, qtyType: m.qtyType, essential: m.essential })) },
      },
    });
  });
}

/** Add an extra (non-BOM) material to an order, e.g. a replacement part. */
export async function addOrderMaterial(orderId: number, productId: number, qty: number) {
  if (!(qty > 0)) throw new Error("Quantity must be positive");
  return db.$transaction(async (tx) => {
    const po = await tx.productionOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (po.status === "CLOSED") throw new Error("Order is closed");
    const p = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    const existing = await tx.poMaterial.findFirst({ where: { orderId, productId } });
    if (existing) await tx.poMaterial.update({ where: { id: existing.id }, data: { plannedQty: { increment: qty } } });
    else await tx.poMaterial.create({ data: { orderId, productId, plannedQty: qty, unitCost: p.avgCost, qtyType: "FIXED", essential: false } });
    if (po.status === "RELEASED") await tx.stockMove.create({ data: { type: "COMMIT", productId, qty, unitCost: p.avgCost, orderId, note: "Added material" } });
    await tx.productionOrder.update({ where: { id: orderId }, data: { plannedMaterialCost: { increment: qty * p.avgCost } } });
  });
}

export async function removeOrderMaterial(orderId: number, poMaterialId: number) {
  return db.$transaction(async (tx) => {
    const m = await tx.poMaterial.findUniqueOrThrow({ where: { id: poMaterialId } });
    if (m.orderId !== orderId) throw new Error("Wrong order");
    if (m.usedQty > 0) throw new Error("Material already consumed");
    const po = await tx.productionOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (po.status === "CLOSED") throw new Error("Order is closed");
    if (po.status === "RELEASED") await tx.stockMove.create({ data: { type: "ADJUST", productId: m.productId, qty: m.plannedQty, unitCost: m.unitCost, orderId, note: "Removed material — commitment released" } });
    await tx.poMaterial.delete({ where: { id: m.id } });
    await tx.productionOrder.update({ where: { id: orderId }, data: { plannedMaterialCost: { decrement: m.plannedQty * m.unitCost } } });
  });
}

/** Serial = <model or product code><YYMM>-<PO seq>-<unit seq>, unique and race-free. */
export function serialFor(prefix: string, poNo: string, i: number, date = new Date()) {
  const code = prefix.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "SN";
  const yymm = `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1, 2)}`;
  return `${code}${yymm}-${poNo.replace(/\D/g, "").slice(-4)}-${pad(i, 4)}`;
}

export async function releaseOrder(orderId: number) {
  return db.$transaction(async (tx) => {
    const po = await tx.productionOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { bom: { include: { product: true, operations: { orderBy: { seq: "asc" } } } }, materials: true },
    });
    if (po.status !== "DRAFT") throw new Error("Only a DRAFT order can be released");
    if (!po.bom.operations.length) throw new Error("The BOM has no operations");

    const unitCount = po.bom.serialBase ? Math.round(po.plannedQty) : 1;
    const prefix = po.bom.model || po.bom.product.code;
    for (let i = 1; i <= unitCount; i++) {
      const serial = po.bom.serialBase ? serialFor(prefix, po.no, i) : `${po.no}-BATCH`;
      await tx.productionUnit.create({ data: { orderId: po.id, serial, steps: { create: po.bom.operations.map((o) => ({ bomOpId: o.id })) } } });
    }
    for (const m of po.materials) {
      await tx.stockMove.create({ data: { type: "COMMIT", productId: m.productId, qty: m.plannedQty, unitCost: m.unitCost, orderId: po.id } });
    }
    return tx.productionOrder.update({ where: { id: po.id }, data: { status: "RELEASED", plannedStart: po.plannedStart ?? new Date() } });
  });
}
