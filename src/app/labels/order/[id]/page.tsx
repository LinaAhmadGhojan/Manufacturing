import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LabelSheet, SerialLabel } from "@/components/Label";

export const dynamic = "force-dynamic";

export default async function OrderLabels({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fmt?: string; only?: string }> }) {
  const { id } = await params;
  const { fmt, only } = await searchParams;
  const o = await db.productionOrder.findUnique({
    where: { id: Number(id) },
    include: { bom: { include: { product: true } }, units: { orderBy: { id: "asc" }, where: only === "ready" ? { status: { in: ["DONE", "DELIVERED"] } } : undefined } },
  });
  if (!o) notFound();
  return (
    <LabelSheet title={`Serial labels · ${o.no}`} back={`/orders/${o.id}?tab=units`} fmt={fmt} count={o.units.length}>
      {o.units.map((u) => (
        <SerialLabel key={u.id} serial={u.serial} product={o.bom.product.name} code={o.bom.product.code} model={o.bom.model} refrigerant={o.bom.refrigerant} voltage={o.bom.voltage} poNo={o.no} lot={o.lotNo} date={o.createdAt} />
      ))}
    </LabelSheet>
  );
}
