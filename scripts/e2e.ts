// End-to-end checks of the manufacturing lifecycle + data-integrity invariants against the dev DB.
import { db } from "../src/lib/db";
import { createOrder, releaseOrder, updateDraftOrder, addOrderMaterial, removeOrderMaterial } from "../src/lib/po";
import { completeStep, consumeMaterial, logTime, logEquipment, receivable, receiveFinished, recordQc, recordReading, verifyStep, closeOrder, addExpense, deleteExpense, actualTotal } from "../src/lib/exec";
import { receiveStock, adjustStock } from "../src/lib/inventory";

let n = 0;
const ok = (c: unknown, m: string) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  ", ++n, m); };
const throws = async (f: () => Promise<unknown>, m: string, match?: RegExp) => {
  try { await f(); } catch (e) { if (match && !match.test((e as Error).message)) throw new Error(`FAIL: ${m} — wrong error: ${(e as Error).message}`); return console.log("ok  ", ++n, m); }
  throw new Error("FAIL (no throw): " + m);
};

async function main() {
  const bom = await db.bom.findFirstOrThrow({ where: { name: "Split 12K — standard" } });
  const po = await createOrder({ bomId: bom.id, qty: 2 });
  ok(po.plannedMaterialCost > 0 && po.plannedLaborCost > 0 && po.plannedExpenseCost > 0, "plan has material, resource (labour+equipment) and expense costs");

  // Draft editing recalculates the plan
  const before = po.plannedMaterialCost;
  const edited = await updateDraftOrder(po.id, { bomId: bom.id, qty: 4, priority: 1, remark: "edited" });
  ok(Math.abs(edited.plannedMaterialCost - before * 2) < 1e-6, "editing qty 2→4 doubles the planned material cost");
  await updateDraftOrder(po.id, { bomId: bom.id, qty: 2 });

  await releaseOrder(po.id);
  const units = await db.productionUnit.findMany({ where: { orderId: po.id }, include: { steps: { include: { bomOp: { include: { operation: true } } }, orderBy: { bomOp: { seq: "asc" } } } }, orderBy: { id: "asc" } });
  ok(units.length === 2 && new Set(units.map((u) => u.serial)).size === 2, "2 unique serials generated");
  ok(/^SPL12\d{4}-\d{4}-0001$/.test(units[0].serial), `serial format ${units[0].serial}`);

  const team = await db.teamMember.findMany({ include: { allowedOps: true } });
  const cutter = team.find((m) => m.allowedOps.some((a) => a.operationId === units[0].steps[0].bomOp.operationId))!;
  const packer = team.find((m) => m.name === "Hala Odeh")!;
  await throws(() => completeStep(units[0].steps[0].id), "cannot complete an operation before essential materials are consumed", /not consumed/);
  await throws(() => logTime({ stepId: units[0].steps[0].id, memberId: packer.id, minutes: 10 }), "employee not allowed on an operation is rejected", /not allowed/);

  // ── batches ─────────────────────────────────────────────────
  const mats = await db.poMaterial.findMany({ where: { orderId: po.id }, include: { product: true } });
  const batchMat = mats.find((m) => m.product.requireBatch)!;
  await throws(() => consumeMaterial({ orderId: po.id, productId: batchMat.productId, qty: 0.1 }), "batch-tracked material requires a batch", /choose a batch/);
  const alloy = mats.find((m) => m.product.code === "RM-ALLOY")!;
  const expired = await db.batch.findFirstOrThrow({ where: { code: "ALLOY-OLD-01" } });
  await throws(() => consumeMaterial({ orderId: po.id, productId: alloy.productId, qty: 0.01, batchId: expired.id }), "expired batch is rejected", /expired/);
  const other = await db.batch.findFirstOrThrow({ where: { productId: { not: batchMat.productId }, qtyOnHand: { gt: 0 } } });
  await throws(() => consumeMaterial({ orderId: po.id, productId: batchMat.productId, qty: 0.1, batchId: other.id }), "batch of another product is rejected", /another product/);
  const bigBatch = (await db.batch.findMany({ where: { productId: batchMat.productId }, orderBy: { expiryDate: "asc" } }))[0];
  await throws(() => consumeMaterial({ orderId: po.id, productId: batchMat.productId, qty: bigBatch.qtyOnHand + 1000, batchId: bigBatch.id }), "consuming more than stock is rejected", /Insufficient|only/);

  // consume everything FEFO
  for (const m of mats) {
    let need = m.plannedQty;
    if (m.product.requireBatch) {
      const bs = await db.batch.findMany({ where: { productId: m.productId, qtyOnHand: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] }, orderBy: [{ expiryDate: "asc" }, { id: "asc" }] });
      for (const b of bs) { if (need <= 1e-9) break; const t = Math.min(b.qtyOnHand, need); await consumeMaterial({ orderId: po.id, productId: m.productId, qty: t, batchId: b.id }); need -= t; }
    } else await consumeMaterial({ orderId: po.id, productId: m.productId, qty: need });
  }
  const refreshed = await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } });
  ok(refreshed.actualMaterialCost > 0, `material cost booked: ${refreshed.actualMaterialCost.toFixed(2)}`);
  await throws(() => removeOrderMaterial(po.id, mats[0].id), "consumed material can't be removed", /already consumed/);

  // ── operations, readings, sequence ──────────────────────────
  for (const u of units) {
    await throws(() => completeStep(u.steps[1].id), "operations must run in sequence", /previous operations/);
    for (const s of u.steps) {
      const code = s.bomOp.operation.code;
      const m = team.find((x) => x.allowedOps.some((a) => a.operationId === s.bomOp.operationId))!;
      await logTime({ stepId: s.id, memberId: m.id, minutes: 20 });
      for (const a of await db.bomOpAsset.findMany({ where: { bomOpId: s.bomOpId } })) await logEquipment({ stepId: s.id, assetId: a.assetId, minutes: 10 });
      const rs = await db.bomOpReading.findMany({ where: { bomOpId: s.bomOpId } });
      if (code === "VAC" && u === units[0]) {
        await throws(() => completeStep(s.id), "mandatory reading must be captured before completing", /Reading required/);
        const bad = await recordReading({ stepId: s.id, parameterId: rs[0].parameterId, value: 99999 });
        ok(!bad.inRange, "out-of-range reading is flagged");
      }
      for (const r of rs) { const v = await recordReading({ stepId: s.id, parameterId: r.parameterId, value: r.max > r.min ? (r.min + r.max) / 2 : 1 }); ok(v.inRange, `reading ${code}/${r.parameterId} in range`); }
      await completeStep(s.id);
      let cur = await db.productionStep.findUniqueOrThrow({ where: { id: s.id } });
      if (cur.status === "VERIFY") { await verifyStep(s.id); cur = await db.productionStep.findUniqueOrThrow({ where: { id: s.id } }); }
      if (cur.status === "QC_PENDING") await recordQc({ stepId: s.id, result: "PASS" });
    }
  }

  // ── receiving, lot, costing ─────────────────────────────────
  const info = await receivable(po.id);
  ok(info.qty === 2, `2 units receivable (got ${info.qty})`);
  const fgBefore = await db.product.findUniqueOrThrow({ where: { id: bom.productId } });
  await receiveFinished(po.id);
  const done = await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } });
  ok(done.producedQty === 2 && done.lotNo === `LOT-${po.no}`, `produced 2 into lot ${done.lotNo}`);
  const lot = await db.batch.findFirstOrThrow({ where: { code: done.lotNo!, productId: bom.productId } });
  ok(lot.qtyIn === 2 && lot.orderId === po.id, "finished-goods lot batch created");
  const fg = await db.product.findUniqueOrThrow({ where: { id: bom.productId } });
  ok(fg.qtyOnHand === fgBefore.qtyOnHand + 2 && fg.avgCost > 0, `finished stock ${fg.qtyOnHand} @ ${fg.avgCost.toFixed(2)}`);
  ok((await db.productionUnit.count({ where: { orderId: po.id, status: "DELIVERED" } })) === 2, "both units delivered");

  const exp0 = (await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })).actualExpenseCost;
  await addExpense({ orderId: po.id, name: "Courier", amount: 5 });
  const eRow = await db.expense.findFirstOrThrow({ where: { orderId: po.id, name: "Courier" } });
  ok((await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })).actualExpenseCost === exp0 + 5, "expense adds to order cost");
  await deleteExpense(eRow.id);
  ok((await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })).actualExpenseCost === exp0, "deleting the expense reverses the cost");
  await closeOrder(po.id, "done");
  ok((await db.productionOrder.findUniqueOrThrow({ where: { id: po.id } })).status === "CLOSED", "order closed");
  await throws(() => consumeMaterial({ orderId: po.id, productId: mats[0].productId, qty: 1 }), "closed order accepts no more consumption", /closed/);

  // ── QC fail → hold; extra material; purchasing ───────────────
  const po2 = await createOrder({ bomId: bom.id, qty: 1 });
  const extra = await db.product.findFirstOrThrow({ where: { code: "RM-CU-58" } }); // not part of the 12K BOM
  await addOrderMaterial(po2.id, extra.id, 3);
  await releaseOrder(po2.id);
  const extraRow = await db.poMaterial.findFirstOrThrow({ where: { orderId: po2.id, productId: extra.id } });
  ok(extraRow.qtyType === "FIXED" && !extraRow.essential && extraRow.plannedQty === 3, "extra non-BOM material added to the order");
  await removeOrderMaterial(po2.id, extraRow.id);
  ok((await db.poMaterial.count({ where: { orderId: po2.id, productId: extra.id } })) === 0, "unused extra material can be removed again");

  const rm = await db.product.findFirstOrThrow({ where: { code: "RM-CU-14" } });
  const stockBefore = rm.qtyOnHand;
  await receiveStock({ productId: rm.id, qty: 100, unitCost: 3 });
  const rm2 = await db.product.findUniqueOrThrow({ where: { id: rm.id } });
  ok(rm2.qtyOnHand === stockBefore + 100 && rm2.avgCost > rm.avgCost, "stock receipt raises quantity and weighted-average cost");
  await throws(() => receiveStock({ productId: batchMat.productId, qty: 1, unitCost: 1 }), "receipt for a batch-tracked item needs a batch code", /batch tracked/);
  await adjustStock({ productId: rm.id, delta: -100, note: "test correction" });
  await throws(() => adjustStock({ productId: rm.id, delta: -1e9, note: "x" }), "adjustment can't make stock negative", /negative/);

  // ── invariants across the whole database ─────────────────────
  const prods = await db.product.findMany({ include: { batches: true } });
  for (const p of prods.filter((x) => x.requireBatch)) {
    const sum = p.batches.reduce((s, b) => s + b.qtyOnHand, 0);
    ok(Math.abs(sum - p.qtyOnHand) < 1e-6, `stock = Σ batches for ${p.code} (${p.qtyOnHand})`);
  }
  const orders = await db.productionOrder.findMany({ include: { consumptions: true, materials: true } });
  for (const o of orders) {
    const cost = o.consumptions.reduce((s, c) => s + c.qty * c.unitCost, 0);
    ok(Math.abs(cost - o.actualMaterialCost) < 1e-6, `${o.no}: actual material cost = Σ consumptions`);
    for (const m of o.materials) {
      const used = o.consumptions.filter((c) => c.productId === m.productId).reduce((s, c) => s + c.qty, 0);
      if (Math.abs(used - m.usedQty) > 1e-6) throw new Error(`FAIL: ${o.no} usedQty mismatch for product ${m.productId}`);
    }
    ok(true, `${o.no}: per-material used qty = Σ consumptions`);
    ok(actualTotal(o) >= o.actualMaterialCost, `${o.no}: totals consistent`);
  }
  const neg = await db.product.count({ where: { qtyOnHand: { lt: 0 } } });
  ok(neg === 0, "no product has negative stock");
  console.log(`\nALL ${n} E2E CHECKS PASSED`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => db.$disconnect());
