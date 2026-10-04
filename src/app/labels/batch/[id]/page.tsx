import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BatchLabel, LabelSheet } from "@/components/Label";

export const dynamic = "force-dynamic";

export default async function BatchLabelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fmt?: string; n?: string }> }) {
  const { id } = await params;
  const { fmt, n } = await searchParams;
  const b = await db.batch.findUnique({ where: { id: Number(id) }, include: { product: true } });
  if (!b) notFound();
  const supplier = b.supplierId ? (await db.supplier.findUnique({ where: { id: b.supplierId } }))?.name : null;
  const copies = Math.min(Math.max(Number(n) || 1, 1), 60);
  return (
    <LabelSheet title={`Batch label · ${b.code}`} back="/inventory?tab=batches" fmt={fmt} count={copies}>
      {Array.from({ length: copies }, (_, i) => <BatchLabel key={i} code={b.code} product={b.product.name} productCode={b.product.code} qty={b.qtyIn} uom={b.product.uom} supplier={supplier} received={b.receivedAt} expiry={b.expiryDate} />)}
    </LabelSheet>
  );
}
