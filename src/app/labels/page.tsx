import Link from "next/link";
import { Tag } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, PageHead, Table, btn2, fmt, td } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Labels() {
  const [orders, batches] = await Promise.all([
    db.productionOrder.findMany({ where: { status: { not: "DRAFT" } }, orderBy: { id: "desc" }, take: 12, include: { bom: { include: { product: true } }, _count: { select: { units: true } } } }),
    db.batch.findMany({ orderBy: { id: "desc" }, take: 12, include: { product: true } }),
  ]);
  return (
    <div>
      <PageHead title="Labels & barcodes" sub="Code 128 barcodes — A4 sheets or 100×60 mm thermal labels" icon={Tag} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Serial & lot labels (by production order)">
          <Table head={["Order", "Product", "Units", "", ""]} empty={orders.length ? undefined : "No released orders"}>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className={`${td} font-mono text-xs`}><Link href={`/orders/${o.id}`} className="text-brand hover:underline">{o.no}</Link></td><td className={td}>{o.bom.product.name}</td><td className={td}>{o._count.units}</td>
                <td className={td}>{o._count.units > 0 && <Link href={`/labels/order/${o.id}`} className={`${btn2} !py-0.5`}><Tag size={13} /> Serials</Link>}</td>
                <td className={td}>{o.lotNo && <Link href={`/labels/lot/${o.id}`} className={`${btn2} !py-0.5`}>Lot</Link>}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Raw material batch labels">
          <Table head={["Batch", "Item", "Qty in", "Expiry", ""]} empty={batches.length ? undefined : "No batches"}>
            {batches.map((b) => (
              <tr key={b.id}><td className={`${td} font-mono text-xs`}>{b.code}</td><td className={td}>{b.product.name}</td><td className={td}>{fmt(b.qtyIn)}</td><td className={td}>{b.expiryDate ? <Badge s={b.expiryDate < new Date() ? "SCRAP" : "DONE"} /> : null} {b.expiryDate?.toLocaleDateString() ?? "—"}</td>
                <td className={td}><Link href={`/labels/batch/${b.id}`} className={`${btn2} !py-0.5`}><Tag size={13} /> Label</Link></td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
