// Shop-floor execution: material consumption (batch-aware), labour, equipment,
// readings, step completion, QC, receiving finished goods (lot-aware), closing.
import { db } from "./db";
import { receivableQty } from "./bom";
import { getBool } from "./settings";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export const actualTotal = (o: { actualMaterialCost: number; actualLaborCost: number; actualExpenseCost: number }) =>
  o.actualMaterialCost + o.actualLaborCost + o.actualExpenseCost;
export const plannedTotal = (o: { plannedMaterialCost: number; plannedLaborCost: number; plannedExpenseCost: number }) =>
  o.plannedMaterialCost + o.plannedLaborCost + o.plannedExpenseCost;

async function liveOrder(tx: Tx, orderId: number) {
  const po = await tx.productionOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (po.status === "SUSPENDED") throw new Error("Order is suspended");
  if (po.status === "CLOSED") throw new Error("Order is closed");
  if (po.status !== "RELEASED") throw new Error("Order is not released");
  return po;
}

export async function consumeMaterial(input: { orderId: number; productId: number; qty: number; unitId?: number; batchId?: number }) {
  if (!(input.qty > 0)) throw new Error("Quantity must be positive");
  return db.$transaction(async (tx) => {
    await liveOrder(tx, input.orderId);
    const mat = await tx.poMaterial.findFirst({ where: { orderId: input.orderId, productId: input.productId } });
    if (!mat) throw new Error("Material is not part of this order");
    const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
    if (product.qtyOnHand < input.qty) throw new Error(`Insufficient stock: ${product.qtyOnHand} ${product.uom} on hand`);

    let batchId: number | null = null;
    let unitCost = product.avgCost;
    if (product.requireBatch) {
      if (!input.batchId) throw new Error(`${product.name} is batch tracked — choose a batch`);
      const b = await tx.batch.findUniqueOrThrow({ where: { id: input.batchId } });
      if (b.productId !== product.id) throw new Error("Batch belongs to another product");
      if (b.expiryDate && b.expiryDate < new Date()) throw new Error(`Batch ${b.code} expired on ${b.expiryDate.toLocaleDateString()}`);
      if (b.qtyOnHand < input.qty) throw new Error(`Batch ${b.code} has only ${b.qtyOnHand} ${product.uom}`);
      await tx.batch.update({ where: { id: b.id }, data: { qtyOnHand: { decrement: input.qty } } });
      batchId = b.id;
      unitCost = b.unitCost || product.avgCost;
    }

    await tx.consumption.create({ data: { orderId: input.orderId, productId: product.id, qty: input.qty, unitCost, unitId: input.unitId, batchId } });
    await tx.product.update({ where: { id: product.id }, data: { qtyOnHand: { decrement: input.qty } } });
    await tx.poMaterial.update({ where: { id: mat.id }, data: { usedQty: { increment: input.qty } } });
    await tx.stockMove.create({ data: { type: "CONSUME", productId: product.id, qty: -input.qty, unitCost, orderId: input.orderId, batchId } });
    await tx.productionOrder.update({ where: { id: input.orderId }, data: { actualMaterialCost: { increment: input.qty * unitCost } } });
  });
}

export async function logTime(input: { stepId: number; memberId: number; minutes: number }) {
  if (!(input.minutes > 0)) throw new Error("Minutes must be positive");
  return db.$transaction(async (tx) => {
    const step = await tx.productionStep.findUniqueOrThrow({ where: { id: input.stepId }, include: { unit: true, bomOp: true } });
    await liveOrder(tx, step.unit.orderId);
    const m = await tx.teamMember.findUniqueOrThrow({ where: { id: input.memberId }, include: { allowedOps: true } });
    if (m.allowedOps.length && !m.allowedOps.some((a) => a.operationId === step.bomOp.operationId)) throw new Error(`${m.name} is not allowed to work on this operation`);
    const cost = (input.minutes / 60) * m.hourRate;
    await tx.timeEntry.create({ data: { stepId: step.id, memberId: m.id, minutes: input.minutes, hourRate: m.hourRate, cost } });
    await tx.productionStep.update({ where: { id: step.id }, data: { status: step.status === "PENDING" ? "IN_PROGRESS" : step.status, startedAt: step.startedAt ?? new Date() } });
    await tx.productionOrder.update({ where: { id: step.unit.orderId }, data: { actualLaborCost: { increment: cost } } });
  });
}

export async function logEquipment(input: { stepId: number; assetId: number; minutes: number }) {
  if (!(input.minutes > 0)) throw new Error("Minutes must be positive");
  return db.$transaction(async (tx) => {
    const step = await tx.productionStep.findUniqueOrThrow({ where: { id: input.stepId }, include: { unit: true } });
    await liveOrder(tx, step.unit.orderId);
    const a = await tx.asset.findUniqueOrThrow({ where: { id: input.assetId } });
    const cost = (input.minutes / 60) * a.hourRate;
    await tx.equipmentEntry.create({ data: { stepId: step.id, assetId: a.id, minutes: input.minutes, rate: a.hourRate, cost } });
    await tx.productionStep.update({ where: { id: step.id }, data: { status: step.status === "PENDING" ? "IN_PROGRESS" : step.status, startedAt: step.startedAt ?? new Date() } });
    await tx.productionOrder.update({ where: { id: step.unit.orderId }, data: { actualLaborCost: { increment: cost } } });
  });
}

export async function recordReading(input: { stepId: number; parameterId: number; value: number }) {
  return db.$transaction(async (tx) => {
    const step = await tx.productionStep.findUniqueOrThrow({ where: { id: input.stepId }, include: { unit: true } });
    await liveOrder(tx, step.unit.orderId);
    const spec = await tx.bomOpReading.findFirst({ where: { bomOpId: step.bomOpId, parameterId: input.parameterId }, include: { parameter: true } });
    const lo = spec && spec.max > spec.min ? spec.min : spec?.parameter.lowRange ?? 0;
    const hi = spec && spec.max > spec.min ? spec.max : spec?.parameter.highRange ?? 0;
    const inRange = hi > lo ? input.value >= lo && input.value <= hi : true;
    await tx.readingEntry.create({ data: { stepId: step.id, parameterId: input.parameterId, value: input.value, inRange } });
    return { inRange };
  });
}

/** Operation finished by a technician: goes to verify, QC, or straight to DONE. */
export async function completeStep(stepId: number) {
  return db.$transaction(async (tx) => {
    const step = await tx.productionStep.findUniqueOrThrow({
      where: { id: stepId },
      include: { unit: true, bomOp: { include: { operation: true, readings: { include: { parameter: true } } } }, readings: true },
    });
    await liveOrder(tx, step.unit.orderId);
    if (step.status === "DONE" || step.status === "QC_PENDING" || step.status === "VERIFY") throw new Error("Step already completed");

    if (await getBool("mustConsumeAllEssential")) {
      const missing = await tx.poMaterial.findMany({ where: { orderId: step.unit.orderId, essential: true, usedQty: { lte: 0 } }, include: { product: true } });
      if (missing.length) throw new Error(`Essential material not consumed: ${missing.map((m) => m.product.name).join(", ")}`);
    }
    for (const r of step.bomOp.readings) {
      if (r.mandatory && !step.readings.some((x) => x.parameterId === r.parameterId)) throw new Error(`Reading required: ${r.parameter.name}`);
    }
    const earlier = await tx.productionStep.count({ where: { unitId: step.unitId, bomOp: { seq: { lt: step.bomOp.seq } }, status: { notIn: ["DONE"] } } });
    if (earlier) throw new Error("Complete the previous operations first");

    const next = step.bomOp.operation.requiresVerify ? "VERIFY" : step.bomOp.qcTemplateId && step.bomOp.qcMandatory ? "QC_PENDING" : "DONE";
    await tx.productionStep.update({ where: { id: step.id }, data: { status: next, endedAt: next === "DONE" ? new Date() : null } });
    await refreshUnit(tx, step.unitId);
  });
}

export async function verifyStep(stepId: number) {
  return db.$transaction(async (tx) => {
    const step = await tx.productionStep.findUniqueOrThrow({ where: { id: stepId }, include: { bomOp: true } });
    if (step.status !== "VERIFY") throw new Error("Step is not awaiting verification");
    const next = step.bomOp.qcTemplateId && step.bomOp.qcMandatory ? "QC_PENDING" : "DONE";
    await tx.productionStep.update({ where: { id: stepId }, data: { status: next, endedAt: next === "DONE" ? new Date() : null } });
    await refreshUnit(tx, step.unitId);
  });
}

export async function recordQc(input: { stepId: number; result: "PASS" | "FAIL"; failAction?: "RETURN_TO_TECH" | "HOLD" | "SCRAP"; remark?: string }) {
  return db.$transaction(async (tx) => {
    const step = await tx.productionStep.findUniqueOrThrow({ where: { id: input.stepId }, include: { bomOp: true } });
    if (step.status !== "QC_PENDING") throw new Error("Step is not awaiting QC");
    await tx.qcCheck.create({
      data: { unitId: step.unitId, templateId: step.bomOp.qcTemplateId ?? 0, result: input.result, failAction: input.result === "FAIL" ? input.failAction ?? "RETURN_TO_TECH" : null, remark: input.remark },
    });
    if (input.result === "PASS") {
      await tx.productionStep.update({ where: { id: step.id }, data: { status: "DONE", endedAt: new Date() } });
    } else {
      const a = input.failAction ?? "RETURN_TO_TECH";
      const stepStatus = a === "RETURN_TO_TECH" ? "PENDING" : a === "HOLD" ? "HOLDING" : "SCRAP";
      await tx.productionStep.update({ where: { id: step.id }, data: { status: stepStatus, endedAt: null } });
    }
    await refreshUnit(tx, step.unitId);
  });
}

export async function releaseHolding(unitId: number) {
  return db.$transaction(async (tx) => {
    await tx.productionStep.updateMany({ where: { unitId, status: "HOLDING" }, data: { status: "PENDING" } });
    await refreshUnit(tx, unitId);
  });
}

async function refreshUnit(tx: Tx, unitId: number) {
  const steps = await tx.productionStep.findMany({ where: { unitId } });
  const has = (s: string) => steps.some((x) => x.status === s);
  const status = has("SCRAP") ? "SCRAP" : has("HOLDING") ? "HOLDING" : steps.every((x) => x.status === "DONE") ? "DONE" : has("QC_PENDING") ? "QC_PENDING" : has("VERIFY") ? "VERIFY" : steps.some((x) => x.status !== "PENDING") ? "IN_PROGRESS" : "PENDING";
  await tx.productionUnit.update({ where: { id: unitId }, data: { status } });
}

export async function addExpense(input: { orderId: number; name: string; amount: number; expenseTypeId?: number }) {
  if (!(input.amount > 0)) throw new Error("Amount must be positive");
  return db.$transaction(async (tx) => {
    await liveOrder(tx, input.orderId);
    await tx.expense.create({ data: { orderId: input.orderId, name: input.name, amount: input.amount, expenseTypeId: input.expenseTypeId ?? null } });
    await tx.productionOrder.update({ where: { id: input.orderId }, data: { actualExpenseCost: { increment: input.amount } } });
  });
}

export async function deleteExpense(expenseId: number) {
  return db.$transaction(async (tx) => {
    const e = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
    await liveOrder(tx, e.orderId);
    await tx.expense.delete({ where: { id: e.id } });
    await tx.productionOrder.update({ where: { id: e.orderId }, data: { actualExpenseCost: { decrement: e.amount } } });
  });
}

/** How many finished units can be received right now. */
export async function receivable(orderId: number) {
  const po = await db.productionOrder.findUniqueOrThrow({ where: { id: orderId }, include: { bom: true, materials: true, units: true } });
  const received = po.bom.serialBase ? po.units.filter((u) => u.received).length : po.producedQty;
  const byMaterials = receivableQty(po.materials, po.plannedQty, received);
  if (po.bom.serialBase) {
    const ready = po.units.filter((u) => u.status === "DONE" && !u.received).length;
    return { qty: Math.min(ready, byMaterials), received, serialBase: true };
  }
  const allDone = po.units.length > 0 && po.units.every((u) => u.status === "DONE");
  return { qty: allDone ? byMaterials : 0, received, serialBase: false };
}

export async function receiveFinished(orderId: number, qty?: number) {
  const info = await receivable(orderId);
  return db.$transaction(async (tx) => {
    const po = await liveOrder(tx, orderId);
    const take = Math.min(qty ?? info.qty, info.qty);
    if (take <= 0) throw new Error("Nothing is ready to receive");
    const bom = await tx.bom.findUniqueOrThrow({ where: { id: po.bomId } });

    const newProduced = po.producedQty + take;
    const cost = newProduced > 0 ? actualTotal(po) / newProduced : 0;
    const lotNo = po.lotNo ?? `LOT-${po.no}`;

    if (bom.serialBase) {
      const units = await tx.productionUnit.findMany({ where: { orderId, status: "DONE", received: false }, take: Math.floor(take), orderBy: { id: "asc" } });
      for (const u of units) {
        await tx.productionUnit.update({ where: { id: u.id }, data: { received: true, status: "DELIVERED" } });
        await tx.receipt.create({ data: { orderId, unitId: u.id, qty: 1, unitCost: cost } });
      }
    } else {
      await tx.receipt.create({ data: { orderId, qty: take, unitCost: cost } });
    }
    // Finished-goods production lot
    const lot = await tx.batch.upsert({
      where: { productId_code: { productId: bom.productId, code: lotNo } },
      update: { qtyIn: { increment: take }, qtyOnHand: { increment: take }, unitCost: cost },
      create: { productId: bom.productId, code: lotNo, qtyIn: take, qtyOnHand: take, unitCost: cost, orderId },
    });
    await tx.stockMove.create({ data: { type: "RECEIVE", productId: bom.productId, qty: take, unitCost: cost, orderId, batchId: lot.id } });
    const fg = await tx.product.findUniqueOrThrow({ where: { id: bom.productId } });
    const newAvg = (fg.avgCost * fg.qtyOnHand + cost * take) / (fg.qtyOnHand + take);
    await tx.product.update({ where: { id: fg.id }, data: { qtyOnHand: { increment: take }, avgCost: newAvg } });
    await tx.productionOrder.update({ where: { id: orderId }, data: { producedQty: newProduced, lotNo } });
  });
}

export async function closeOrder(orderId: number, reason?: string) {
  const info = await receivable(orderId);
  if (info.qty > 0) throw new Error("There are still finished goods that can be received");
  return db.$transaction(async (tx) => {
    const po = await tx.productionOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (po.status === "CLOSED") throw new Error("Already closed");
    const mats = await tx.poMaterial.findMany({ where: { orderId } });
    for (const m of mats) {
      const left = m.plannedQty - m.usedQty;
      if (left > 0) await tx.stockMove.create({ data: { type: "ADJUST", productId: m.productId, qty: left, unitCost: m.unitCost, orderId, note: "Release commitment on close" } });
    }
    await tx.productionUnit.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "LOCKED" } });
    await tx.productionOrder.update({ where: { id: orderId }, data: { status: "CLOSED", closedAt: new Date(), closeReason: reason } });
  });
}

export async function setSuspended(orderId: number, suspended: boolean) {
  const po = await db.productionOrder.findUniqueOrThrow({ where: { id: orderId } });
  if (suspended && po.status !== "RELEASED") throw new Error("Only a released order can be suspended");
  if (!suspended && po.status !== "SUSPENDED") throw new Error("Order is not suspended");
  await db.productionOrder.update({ where: { id: orderId }, data: { status: suspended ? "SUSPENDED" : "RELEASED" } });
}
