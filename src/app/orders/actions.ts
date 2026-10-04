"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { act, num, str } from "@/lib/action";
import { addOrderMaterial, createOrder, releaseOrder, removeOrderMaterial, updateDraftOrder } from "@/lib/po";
import { addExpense, closeOrder, consumeMaterial, deleteExpense, receiveFinished, setSuspended } from "@/lib/exec";
import { createPurchaseRequest } from "@/lib/inventory";

const schema = z.object({
  bomId: z.coerce.number().int().positive("Choose a BOM"),
  qty: z.coerce.number().positive("Quantity must be positive"),
  lineId: z.coerce.number().int().positive().optional(),
  priority: z.coerce.number().int().min(1).max(3).default(2),
});

function parse(fd: FormData) {
  const p = schema.parse({ bomId: fd.get("bomId"), qty: fd.get("qty"), lineId: fd.get("lineId") || undefined, priority: fd.get("priority") || 2 });
  const end = str(fd.get("plannedEnd")), start = str(fd.get("plannedStart"));
  return { ...p, plannedEnd: end ? new Date(end) : null, plannedStart: start ? new Date(start) : null, remark: str(fd.get("remark")) || null };
}

export async function createOrderAction(fd: FormData) {
  let id = 0;
  await act("/orders/new", async () => { id = (await createOrder(parse(fd))).id; });
  const { redirect } = await import("next/navigation");
  redirect(`/orders/${id}`);
}

export async function updateOrderAction(id: number, fd: FormData) {
  await act(`/orders/${id}/edit`, () => updateDraftOrder(id, parse(fd)), `/orders/${id}`);
}

const back = (id: number, tab = "overview") => `/orders/${id}?tab=${tab}`;

export async function releaseOrderAction(fd: FormData) { const id = num(fd.get("id")); await act(back(id), () => releaseOrder(id)); }
export async function suspendAction(fd: FormData) { const id = num(fd.get("id")); await act(back(id), () => setSuspended(id, true)); }
export async function unsuspendAction(fd: FormData) { const id = num(fd.get("id")); await act(back(id), () => setSuspended(id, false)); }
export async function closeAction(fd: FormData) { const id = num(fd.get("id")); await act(back(id), () => closeOrder(id, str(fd.get("reason")) || undefined)); }

export async function deleteOrderAction(fd: FormData) {
  const id = num(fd.get("id"));
  await act(back(id), async () => {
    const po = await db.productionOrder.findUniqueOrThrow({ where: { id } });
    if (po.status !== "DRAFT") throw new Error("Only drafts can be deleted");
    await db.productionOrder.delete({ where: { id } });
  }, "/orders");
}

export async function consumeAction(fd: FormData) {
  const orderId = num(fd.get("orderId"));
  await act(back(orderId, "materials"), () =>
    consumeMaterial({ orderId, productId: num(fd.get("productId")), qty: num(fd.get("qty")), unitId: num(fd.get("unitId")) || undefined, batchId: num(fd.get("batchId")) || undefined }),
  );
}

export async function addMaterialAction(fd: FormData) {
  const orderId = num(fd.get("orderId"));
  await act(back(orderId, "materials"), () => addOrderMaterial(orderId, num(fd.get("productId")), num(fd.get("qty"))));
}
export async function removeMaterialAction(fd: FormData) {
  const orderId = num(fd.get("orderId"));
  await act(back(orderId, "materials"), () => removeOrderMaterial(orderId, num(fd.get("id"))));
}
export async function purchaseRequestAction(fd: FormData) {
  const orderId = num(fd.get("orderId"));
  await act(back(orderId, "materials"), () => createPurchaseRequest({ productId: num(fd.get("productId")), qty: num(fd.get("qty")), orderId, remark: "Raised from order shortage" }));
}

export async function expenseAction(fd: FormData) {
  const orderId = num(fd.get("orderId"));
  const typeId = num(fd.get("expenseTypeId")) || undefined;
  await act(back(orderId, "expenses"), async () => {
    const t = typeId ? await db.expenseType.findUnique({ where: { id: typeId } }) : null;
    await addExpense({ orderId, name: str(fd.get("name")) || t?.name || "Expense", amount: num(fd.get("amount")), expenseTypeId: typeId });
  });
}
export async function deleteExpenseAction(fd: FormData) {
  const orderId = num(fd.get("orderId"));
  await act(back(orderId, "expenses"), () => deleteExpense(num(fd.get("id"))));
}
export async function receiveAction(fd: FormData) {
  const orderId = num(fd.get("orderId"));
  await act(back(orderId, "receive"), () => receiveFinished(orderId, num(fd.get("qty")) || undefined));
}
