import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LabelSheet, LotLabel } from "@/components/Label";

export const dynamic = "force-dynamic";

export default async function LotLabelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fmt?: string }> }) {
  const { id } = await params;
  const { fmt } = await searchParams;
  const o = await db.productionOrder.findUnique({ where: { id: Number(id) }, include: { bom: { include: { product: true } } } });
  if (!o || !o.lotNo) notFound();
  return (
    <LabelSheet title={`Lot label · ${o.lotNo}`} back={`/orders/${o.id}?tab=receive`} fmt={fmt} count={1}>
      <LotLabel lot={o.lotNo} product={o.bom.product.name} productCode={o.bom.product.code} qty={o.producedQty} uom={o.bom.product.uom} poNo={o.no} date={new Date()} />
    </LabelSheet>
  );
}
