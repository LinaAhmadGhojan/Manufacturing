import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LabelSheet, SerialLabel } from "@/components/Label";

export const dynamic = "force-dynamic";

export default async function SerialLabelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fmt?: string }> }) {
  const { id } = await params;
  const { fmt } = await searchParams;
  const u = await db.productionUnit.findUnique({ where: { id: Number(id) }, include: { order: { include: { bom: { include: { product: true } } } } } });
  if (!u) notFound();
  const o = u.order;
  return (
    <LabelSheet title={`Label · ${u.serial}`} back={`/orders/${o.id}?tab=units`} fmt={fmt} count={1}>
      <SerialLabel serial={u.serial} product={o.bom.product.name} code={o.bom.product.code} model={o.bom.model} refrigerant={o.bom.refrigerant} voltage={o.bom.voltage} poNo={o.no} lot={o.lotNo} date={o.createdAt} />
    </LabelSheet>
  );
}
