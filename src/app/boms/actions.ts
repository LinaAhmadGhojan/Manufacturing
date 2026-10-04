"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { act, num } from "@/lib/action";

const qt = z.enum(["FIXED", "RATIO"]);
const bomSchema = z.object({
  name: z.string().min(1, "BOM name is required"),
  productId: z.number().int().positive("Choose the finished product"),
  outputQty: z.number().positive("Output quantity must be positive"),
  durationHrs: z.number().min(0),
  isDefault: z.boolean(), serialBase: z.boolean(), prodLevelQc: z.boolean(),
  model: z.string(), refrigerant: z.string(), voltage: z.string(), remark: z.string(),
  materials: z.array(z.object({ productId: z.number().int().positive("Select every material"), qty: z.number().positive("Material quantity must be positive"), qtyType: qt, wastePct: z.number().min(0).max(100), essential: z.boolean(), remark: z.string() })).min(1, "Add at least one material"),
  operations: z.array(z.object({
    operationId: z.number().int().positive("Select every operation"), hours: z.number().min(0), hoursType: qt, costPerHour: z.number().min(0),
    qcTemplateId: z.number().int().positive().nullable(), qcMandatory: z.boolean(), remark: z.string(), subProcessIds: z.array(z.number()),
    assets: z.array(z.object({ assetId: z.number().int().positive(), hours: z.number().min(0) })),
    expenses: z.array(z.object({ expenseTypeId: z.number().int().positive(), amount: z.number().min(0), amountType: qt })),
    readings: z.array(z.object({ parameterId: z.number().int().positive(), min: z.number(), max: z.number(), mandatory: z.boolean() })),
  })).min(1, "Add at least one operation"),
});

export async function saveBom(id: number | null, fd: FormData) {
  const path = id ? `/boms/${id}` : "/boms/new";
  let savedId = id;
  await act(path, async () => {
    const parsed = bomSchema.safeParse(JSON.parse(String(fd.get("payload"))));
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(" · "));
    const d = parsed.data;
    savedId = await db.$transaction(async (tx) => {
      if (id) {
        if (await tx.productionOrder.count({ where: { bomId: id } })) throw new Error("This BOM is used by production orders and can't be edited. Copy it to a new version instead.");
        await tx.bomMaterial.deleteMany({ where: { bomId: id } });
        await tx.bomOperation.deleteMany({ where: { bomId: id } });
      }
      const data = {
        name: d.name, productId: d.productId, outputQty: d.outputQty, durationHrs: d.durationHrs, isDefault: d.isDefault, serialBase: d.serialBase, prodLevelQc: d.prodLevelQc,
        model: d.model || null, refrigerant: d.refrigerant || null, voltage: d.voltage || null, remark: d.remark || null,
        materials: { create: d.materials.map((m) => ({ ...m, remark: m.remark || null })) },
        operations: {
          create: d.operations.map((o, i) => ({
            operationId: o.operationId, seq: i + 1, hours: o.hours, hoursType: o.hoursType, costPerHour: o.costPerHour, qcTemplateId: o.qcTemplateId, qcMandatory: o.qcMandatory && !!o.qcTemplateId, remark: o.remark || null,
            subs: { create: [...new Set(o.subProcessIds)].map((subProcessId) => ({ subProcessId })) },
            assets: { create: o.assets }, expenses: { create: o.expenses }, readings: { create: o.readings },
          })),
        },
      };
      const bom = id ? await tx.bom.update({ where: { id }, data }) : await tx.bom.create({ data });
      if (d.isDefault) await tx.bom.updateMany({ where: { productId: d.productId, id: { not: bom.id } }, data: { isDefault: false } });
      return bom.id;
    });
  });
  redirect(`/boms/${savedId}?saved=1`);
}

export async function copyBom(fd: FormData) {
  const id = num(fd.get("id"));
  let newId = id;
  await act("/boms", async () => {
    const b = await db.bom.findUniqueOrThrow({ where: { id }, include: { materials: true, operations: { include: { subs: true, assets: true, expenses: true, readings: true } } } });
    const copy = await db.$transaction((tx) => tx.bom.create({
      data: {
        name: `${b.name} (copy)`, productId: b.productId, outputQty: b.outputQty, durationHrs: b.durationHrs, serialBase: b.serialBase, prodLevelQc: b.prodLevelQc, isDefault: false, model: b.model, refrigerant: b.refrigerant, voltage: b.voltage, remark: b.remark,
        materials: { create: b.materials.map(({ productId, qty, qtyType, wastePct, essential, remark }) => ({ productId, qty, qtyType, wastePct, essential, remark })) },
        operations: {
          create: b.operations.map((o) => ({
            operationId: o.operationId, seq: o.seq, hours: o.hours, hoursType: o.hoursType, costPerHour: o.costPerHour, qcTemplateId: o.qcTemplateId, qcMandatory: o.qcMandatory, remark: o.remark,
            subs: { create: o.subs.map((s) => ({ subProcessId: s.subProcessId })) },
            assets: { create: o.assets.map((a) => ({ assetId: a.assetId, hours: a.hours })) },
            expenses: { create: o.expenses.map((e) => ({ expenseTypeId: e.expenseTypeId, amount: e.amount, amountType: e.amountType })) },
            readings: { create: o.readings.map((r) => ({ parameterId: r.parameterId, min: r.min, max: r.max, mandatory: r.mandatory })) },
          })),
        },
      },
    }));
    newId = copy.id;
  });
  redirect(`/boms/${newId}`);
}

export async function deleteBom(fd: FormData) {
  const id = num(fd.get("id"));
  await act("/boms", async () => {
    if (await db.productionOrder.count({ where: { bomId: id } })) throw new Error("BOM is used by production orders — it can be deactivated but not deleted");
    if (await db.productionRequest.count({ where: { bomId: id } })) throw new Error("BOM is used by production requests");
    await db.bom.delete({ where: { id } });
  });
}

export async function toggleBomActive(fd: FormData) {
  const id = num(fd.get("id"));
  await act("/boms", async () => {
    const b = await db.bom.findUniqueOrThrow({ where: { id } });
    await db.bom.update({ where: { id }, data: { active: !b.active } });
  });
}
