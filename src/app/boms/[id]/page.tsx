import Link from "next/link";
import { notFound } from "next/navigation";
import { Network } from "lucide-react";
import { db } from "@/lib/db";
import { ErrorBanner, PageHead, btn2 } from "@/components/ui";
import BomEditor from "../BomEditor";
import { bomLookups } from "../lookups";
import { saveBom } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditBom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const bom = await db.bom.findUnique({
    where: { id: Number(id) },
    include: { materials: true, operations: { orderBy: { seq: "asc" }, include: { subs: true, assets: true, expenses: true, readings: true } }, _count: { select: { orders: true } } },
  });
  if (!bom) notFound();
  return (
    <div>
      <PageHead title={bom.name} sub={bom._count.orders ? `Used by ${bom._count.orders} order(s) — structure is locked; copy it to a new version to change` : "Edit"} icon={Network}>
        <Link href={`/orders/new?bom=${bom.id}`} className={btn2}>New order from this BOM</Link>
      </PageHead>
      <ErrorBanner error={error} />
      {saved && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">BOM saved.</div>}
      <BomEditor
        locked={bom._count.orders > 0}
        action={saveBom.bind(null, bom.id)}
        lookups={await bomLookups()}
        initial={{
          name: bom.name, productId: bom.productId, outputQty: bom.outputQty, durationHrs: bom.durationHrs, isDefault: bom.isDefault, serialBase: bom.serialBase, prodLevelQc: bom.prodLevelQc,
          model: bom.model ?? "", refrigerant: bom.refrigerant ?? "", voltage: bom.voltage ?? "", remark: bom.remark ?? "",
          materials: bom.materials.map((m) => ({ productId: m.productId, qty: m.qty, qtyType: m.qtyType, wastePct: m.wastePct, essential: m.essential, remark: m.remark ?? "" })),
          operations: bom.operations.map((o) => ({
            operationId: o.operationId, hours: o.hours, hoursType: o.hoursType, costPerHour: o.costPerHour, qcTemplateId: o.qcTemplateId, qcMandatory: o.qcMandatory, remark: o.remark ?? "",
            subProcessIds: o.subs.map((s) => s.subProcessId), assets: o.assets.map((a) => ({ assetId: a.assetId, hours: a.hours })),
            expenses: o.expenses.map((e) => ({ expenseTypeId: e.expenseTypeId, amount: e.amount, amountType: e.amountType })),
            readings: o.readings.map((r) => ({ parameterId: r.parameterId, min: r.min, max: r.max, mandatory: r.mandatory })),
          })),
        }}
      />
    </div>
  );
}
