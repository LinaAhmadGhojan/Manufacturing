import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { ErrorBanner, PageHead } from "@/components/ui";
import OrderForm from "@/components/OrderForm";
import { createOrderAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ error?: string; bom?: string }> }) {
  const { error, bom } = await searchParams;
  const [boms, lines] = await Promise.all([db.bom.findMany({ where: { active: true }, include: { product: true }, orderBy: { name: "asc" } }), db.productionLine.findMany({ where: { active: true } })]);
  return (
    <div>
      <PageHead title="New production order" icon={ClipboardList} />
      <ErrorBanner error={error} />
      <OrderForm action={createOrderAction} cancelHref="/orders" submit="Create draft" init={{ bomId: bom ? Number(bom) : undefined }}
        boms={boms.map((b) => ({ id: b.id, label: `${b.product.name} — ${b.name}` }))} lines={lines.map((l) => ({ id: l.id, label: l.name }))} />
    </div>
  );
}
