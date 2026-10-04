import { test } from "node:test";
import assert from "node:assert/strict";
import { explode, receivableQty } from "./bom";

const mats = [
  { productId: 1, qty: 6, qtyType: "RATIO" as const, wastePct: 5, essential: true, unitCost: 4 },
  { productId: 2, qty: 10, qtyType: "FIXED" as const, wastePct: 0, essential: false, unitCost: 1 },
];
const ops = [{ id: 1, hours: 0.5, hoursType: "RATIO" as const, costPerHour: 10 }];

test("RATIO scales with planned qty and includes waste; FIXED does not scale", () => {
  const r = explode(mats, ops, 10, 1);
  assert.equal(r.materials[0].plannedQty, 63); // 6*10*1.05
  assert.equal(r.materials[1].plannedQty, 10);
  assert.equal(r.materialCost, 63 * 4 + 10);
  assert.equal(r.laborCost, 0.5 * 10 * 10);
});

test("receivable qty is limited by scarcest essential RATIO material", () => {
  const m = [
    { essential: true, qtyType: "RATIO" as const, plannedQty: 100, usedQty: 40 }, // 10/unit → 4 units
    { essential: true, qtyType: "RATIO" as const, plannedQty: 50, usedQty: 50 }, // 5/unit → 10 units
    { essential: false, qtyType: "RATIO" as const, plannedQty: 10, usedQty: 0 }, // ignored
  ];
  assert.equal(receivableQty(m, 10, 0), 4);
  assert.equal(receivableQty(m, 10, 3), 1);
  assert.equal(receivableQty(m, 10, 9), 0);
});
