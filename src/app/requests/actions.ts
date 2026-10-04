"use server";

import { db } from "@/lib/db";
import { act, num, str } from "@/lib/action";
import { createOrder, releaseOrder } from "@/lib/po";
import { getBool } from "@/lib/settings";
import { nextNumber } from "@/lib/numbering";

async function acceptRequest(id: number, lineId?: number) {
  const r = await db.productionRequest.findUniqueOrThrow({ where: { id } });
  if (r.status !== "NEW") throw new Error("Request already processed");
  const po = await createOrder({ bomId: r.bomId, qty: r.qty, requestId: r.id, lineId, plannedEnd: r.dueDate, priority: r.priority, remark: [r.salesRef && `Sales ref ${r.salesRef}`, r.remark].filter(Boolean).join(" — ") || null });
  await db.productionRequest.update({ where: { id }, data: { status: "ACCEPTED" } });
  return po;
}

function parse(fd: FormData) {
  const qty = num(fd.get("qty"));
  if (!(qty > 0)) throw new Error("Quantity must be positive");
  const bomId = num(fd.get("bomId"));
  if (!bomId) throw new Error("Choose a BOM");
  const due = str(fd.get("dueDate"));
  return { bomId, qty, dueDate: due ? new Date(due) : null, clientId: num(fd.get("clientId")) || null, salesRef: str(fd.get("salesRef")) || null, priority: num(fd.get("priority"), 2), remark: str(fd.get("remark")) || null };
}

export async function createRequestAction(fd: FormData) {
  await act("/requests/new", async () => {
    const d = parse(fd);
    const bom = await db.bom.findUniqueOrThrow({ where: { id: d.bomId } });
    const last = await db.productionRequest.findFirst({ orderBy: { no: "desc" } });
    const r = await db.productionRequest.create({ data: { ...d, productId: bom.productId, no: nextNumber("PR", last?.no) } });
    if (await getBool("autoAcceptRequests")) {
      const lp = await db.productionLine.findFirst({ where: { active: true } });
      await acceptRequest(r.id, lp?.id);
    }
  }, "/requests");
}

export async function updateRequestAction(id: number, fd: FormData) {
  await act(`/requests/${id}/edit`, async () => {
    const r = await db.productionRequest.findUniqueOrThrow({ where: { id } });
    if (r.status !== "NEW") throw new Error("Only new requests can be edited");
    const d = parse(fd);
    const bom = await db.bom.findUniqueOrThrow({ where: { id: d.bomId } });
    await db.productionRequest.update({ where: { id }, data: { ...d, productId: bom.productId } });
  }, "/requests");
}

export async function deleteRequestAction(fd: FormData) {
  await act("/requests", async () => {
    const r = await db.productionRequest.findUniqueOrThrow({ where: { id: num(fd.get("id")) } });
    if (r.status === "ACCEPTED") throw new Error("Accepted requests are linked to an order and can't be deleted");
    await db.productionRequest.delete({ where: { id: r.id } });
  });
}

export async function acceptRequestAction(fd: FormData) {
  await act("/requests", async () => {
    const po = await acceptRequest(num(fd.get("id")), num(fd.get("lineId")) || undefined);
    if (fd.get("release") === "on") await releaseOrder(po.id);
  });
}

export async function rejectRequestAction(fd: FormData) {
  await act("/requests", async () => {
    await db.productionRequest.update({ where: { id: num(fd.get("id")), status: "NEW" }, data: { status: "REJECTED" } });
  });
}
