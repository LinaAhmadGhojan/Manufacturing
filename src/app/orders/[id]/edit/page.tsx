import { notFound, redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { ErrorBanner, PageHead } from "@/components/ui";
import OrderForm from "@/components/OrderForm";
import { updateOrderAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const po = await db.productionOrder.findUnique({ where: { id: Number(id) } });
  if (!po) notFound();
  if (po.status !== "DRAFT") redirect(`/orders/${po.id}?error=${encodeURIComponent("Only draft orders can be edited")}`);
  const [boms, lines] = await Promise.all([db.bom.findMany({ where: { active: true }, include: { product: true }, orderBy: { name: "asc" } }), db.productionLine.findMany({ where: { active: true } })]);
  return (
    <div>
      <PageHead title={`Edit ${po.no}`} sub="Draft order — the plan is recalculated on save" icon={ClipboardList} />
      <ErrorBanner error={error} />
      <OrderForm action={updateOrderAction.bind(null, po.id)} cancelHref={`/orders/${po.id}`} submit="Save changes"
        init={{ bomId: po.bomId, qty: po.plannedQty, lineId: po.lineId, priority: po.priority, plannedStart: po.plannedStart, plannedEnd: po.plannedEnd, remark: po.remark }}
        boms={boms.map((b) => ({ id: b.id, label: `${b.product.name} — ${b.name}` }))} lines={lines.map((l) => ({ id: l.id, label: l.name }))} />
    </div>
  );
}
