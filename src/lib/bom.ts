// Pure BOM math — no DB access, easy to unit test.

export type QtyType = "FIXED" | "RATIO";

export interface BomMaterialInput {
  productId: number;
  qty: number;
  qtyType: QtyType;
  wastePct: number;
  essential: boolean;
  unitCost: number;
}

export interface BomOperationInput {
  id: number;
  hours: number;
  hoursType: QtyType;
  costPerHour: number;
}

/** Scale factor between planned qty and the qty the BOM was written for. */
export function scale(plannedQty: number, bomOutputQty: number) {
  return bomOutputQty > 0 ? plannedQty / bomOutputQty : 0;
}

/** Planned quantity of one material for a production order (waste included). */
export function plannedMaterialQty(m: BomMaterialInput, plannedQty: number, bomOutputQty: number) {
  const base = m.qtyType === "RATIO" ? m.qty * scale(plannedQty, bomOutputQty) : m.qty;
  return base * (1 + m.wastePct / 100);
}

export function plannedOperationHours(o: BomOperationInput, plannedQty: number, bomOutputQty: number) {
  return o.hoursType === "RATIO" ? o.hours * scale(plannedQty, bomOutputQty) : o.hours;
}

export function explode(
  materials: BomMaterialInput[],
  operations: BomOperationInput[],
  plannedQty: number,
  bomOutputQty: number,
) {
  const mats = materials.map((m) => {
    const qty = plannedMaterialQty(m, plannedQty, bomOutputQty);
    return { ...m, plannedQty: qty, cost: qty * m.unitCost };
  });
  const ops = operations.map((o) => {
    const hours = plannedOperationHours(o, plannedQty, bomOutputQty);
    return { ...o, plannedHours: hours, cost: hours * o.costPerHour };
  });
  return {
    materials: mats,
    operations: ops,
    materialCost: mats.reduce((s, m) => s + m.cost, 0),
    laborCost: ops.reduce((s, o) => s + o.cost, 0),
  };
}

/**
 * How many finished units can be received, limited by the scarcest essential
 * RATIO material (net of what was already received). Mirrors the legacy
 * getQuantityAvailableToReceiveFinal, minus its rounding quirks.
 */
export function receivableQty(
  mats: { essential: boolean; qtyType: QtyType; plannedQty: number; usedQty: number }[],
  plannedQty: number,
  alreadyReceived: number,
) {
  const limits = mats
    .filter((m) => m.essential && m.qtyType === "RATIO" && plannedQty > 0)
    .map((m) => {
      const perUnit = m.plannedQty / plannedQty;
      return perUnit > 0 ? Math.floor(m.usedQty / perUnit + 1e-9) - alreadyReceived : Infinity;
    });
  const can = limits.length ? Math.min(...limits) : plannedQty - alreadyReceived;
  return Math.max(0, Math.min(can, plannedQty - alreadyReceived));
}
