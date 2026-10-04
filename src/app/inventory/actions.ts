"use server";

import { db } from "@/lib/db";
import { act, num, str } from "@/lib/action";
import { adjustStock, createPurchaseRequest, receiveStock } from "@/lib/inventory";

export async function receiveStockAction(fd: FormData) {
  await act("/inventory?tab=receive", async () => {
    const exp = str(fd.get("expiryDate"));
    await receiveStock({
      productId: num(fd.get("productId")), qty: num(fd.get("qty")), unitCost: num(fd.get("unitCost")),
      batchCode: str(fd.get("batchCode")) || undefined, expiryDate: exp ? new Date(exp) : null,
      supplierId: num(fd.get("supplierId")) || null, supplierRef: str(fd.get("supplierRef")) || undefined, note: str(fd.get("note")) || "Stock receipt",
      purchaseId: num(fd.get("purchaseId")) || undefined,
    });
  }, "/inventory?tab=stock");
}

export async function adjustStockAction(fd: FormData) {
  await act("/inventory?tab=adjust", () => adjustStock({ productId: num(fd.get("productId")), delta: num(fd.get("delta")), note: str(fd.get("note")), batchId: num(fd.get("batchId")) || null }), "/inventory?tab=moves");
}

export async function newPurchaseAction(fd: FormData) {
  await act("/inventory?tab=purchases", () => createPurchaseRequest({ productId: num(fd.get("productId")), qty: num(fd.get("qty")), supplierId: num(fd.get("supplierId")) || null, remark: str(fd.get("remark")) || undefined }));
}

export async function purchaseStatusAction(fd: FormData) {
  await act("/inventory?tab=purchases", async () => {
    await db.purchaseRequest.update({ where: { id: num(fd.get("id")) }, data: { status: str(fd.get("status")) as "OPEN" | "ORDERED" | "CANCELLED" } });
  });
}

export async function deletePurchaseAction(fd: FormData) {
  await act("/inventory?tab=purchases", async () => {
    const p = await db.purchaseRequest.findUniqueOrThrow({ where: { id: num(fd.get("id")) } });
    if (p.status === "RECEIVED") throw new Error("Received requests can't be deleted");
    await db.purchaseRequest.delete({ where: { id: p.id } });
  });
}
