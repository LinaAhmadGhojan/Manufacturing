"use server";

import { db } from "@/lib/db";
import { act, num, str } from "@/lib/action";
import { releaseHolding } from "@/lib/exec";

export async function releaseHoldingAction(formData: FormData) {
  await act("/supervisor", () => releaseHolding(num(formData.get("unitId"))));
}

export async function createRepairAction(formData: FormData) {
  await act("/supervisor", async () => {
    const unit = await db.productionUnit.findUniqueOrThrow({ where: { id: num(formData.get("unitId")) } });
    const issue = str(formData.get("issue"));
    if (!issue) throw new Error("Describe the issue");
    await db.repairLog.create({ data: { orderId: unit.orderId, unitId: unit.id, issue } });
  });
}

export async function submitRepairAction(formData: FormData) {
  await act("/supervisor", async () => {
    const fix = str(formData.get("fix"));
    if (!fix) throw new Error("Describe the fix");
    await db.repairLog.update({ where: { id: num(formData.get("id")) }, data: { fix, status: "SUBMITTED" } });
  });
}

export async function approveRepairAction(formData: FormData) {
  await act("/supervisor", async () => {
    const r = await db.repairLog.update({ where: { id: num(formData.get("id")) }, data: { status: "APPROVED", approvedAt: new Date() } });
    await releaseHolding(r.unitId); // approved repair returns a held unit to production
  });
}
