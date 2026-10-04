import { db } from "@/lib/db";
import type { Lookups } from "./BomEditor";

export async function bomLookups(): Promise<Lookups> {
  const [products, operations, templates, subProcesses, assets, parameters, expenseTypes] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }), db.operation.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    db.qcTemplate.findMany({ where: { active: true } }), db.subProcess.findMany({ where: { active: true } }), db.asset.findMany({ where: { active: true } }),
    db.parameter.findMany(), db.expenseType.findMany(),
  ]);
  return {
    products: products.map((p) => ({ id: p.id, name: `${p.name} (${p.code})`, avgCost: p.avgCost })),
    operations: operations.map((o) => ({ id: o.id, name: o.name })), templates: templates.map((t) => ({ id: t.id, name: t.name })),
    subProcesses: subProcesses.map((s) => ({ id: s.id, name: s.name })), assets: assets.map((a) => ({ id: a.id, name: a.name, hourRate: a.hourRate })),
    parameters: parameters.map((p) => ({ id: p.id, name: p.name })), expenseTypes: expenseTypes.map((e) => ({ id: e.id, name: e.name })),
  };
}
