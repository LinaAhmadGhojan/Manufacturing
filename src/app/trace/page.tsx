import Link from "next/link";
import { Search, ScanLine, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, Empty, PageHead, Table, btn, btn2, fmt, input, td } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Trace({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim();

  const [units, batches] = term
    ? await Promise.all([
        db.productionUnit.findMany({ where: { serial: { contains: term } }, take: 20, include: { order: { include: { bom: { include: { product: true } } } } } }),
        db.batch.findMany({ where: { code: { contains: term } }, take: 20, include: { product: true } }),
      ])
    : [[], []];
  const exactUnit = units.find((u) => u.serial.toLowerCase() === term.toLowerCase()) ?? (units.length === 1 && !batches.length ? units[0] : null);
  const exactBatch = batches.find((b) => b.code.toLowerCase() === term.toLowerCase()) ?? (batches.length === 1 && !units.length ? batches[0] : null);

  const unit = exactUnit
    ? await db.productionUnit.findUnique({
        where: { id: exactUnit.id },
        include: {
          order: { include: { bom: { include: { product: true } }, line: true } },
          steps: { include: { bomOp: { include: { operation: true } }, time: { include: { member: true } }, equipment: { include: { asset: true } }, readings: { include: { parameter: true } } }, orderBy: { bomOp: { seq: "asc" } } },
          qc: true, repairs: true, consumptions: { include: { product: true, batch: true } },
        },
      })
    : null;
  const unitOrderBatches = unit ? await db.consumption.findMany({ where: { orderId: unit.orderId, unitId: null, batchId: { not: null } }, include: { product: true, batch: true } }) : [];

  const batch = exactBatch
    ? await db.batch.findUnique({ where: { id: exactBatch.id }, include: { product: true, consumptions: { include: { order: true, unit: true } }, moves: true } })
    : null;
  const batchOrderIds = batch ? [...new Set(batch.consumptions.map((c) => c.orderId))] : [];
  const affected = batchOrderIds.length ? await db.productionUnit.findMany({ where: { orderId: { in: batchOrderIds } }, include: { order: true }, orderBy: { id: "asc" } }) : [];
  const lotUnits = batch?.orderId ? await db.productionUnit.findMany({ where: { orderId: batch.orderId, received: true }, include: { order: true } }) : [];
  const supplier = batch?.supplierId ? await db.supplier.findUnique({ where: { id: batch.supplierId } }) : null;

  return (
    <div>
      <PageHead title="Traceability" sub="Follow a serial back to the material batches it was built from — or a batch forward to every unit it went into" icon={ScanLine} />
      <form className="mb-5 flex gap-2">
        <div className="relative"><Search size={15} className="absolute left-2.5 top-2.5 text-muted" /><input name="q" defaultValue={term} autoFocus placeholder="Scan or type a serial / batch / lot code…" className={`${input} w-96 pl-8`} /></div>
        <button className={btn}>Trace</button>
      </form>

      {term && !units.length && !batches.length && <Card><Empty>Nothing found for “{term}”.</Empty></Card>}

      {term && !unit && !batch && (units.length > 0 || batches.length > 0) && (
        <div className="space-y-4">
          {units.length > 0 && <Table head={["Serial", "Product", "Order", "Status"]}>{units.map((u) => <tr key={u.id}><td className={`${td} font-mono text-xs`}><Link className="text-brand hover:underline" href={`/trace?q=${encodeURIComponent(u.serial)}`}>{u.serial}</Link></td><td className={td}>{u.order.bom.product.name}</td><td className={td}>{u.order.no}</td><td className={td}><Badge s={u.status} /></td></tr>)}</Table>}
          {batches.length > 0 && <Table head={["Batch", "Product", "On hand", "Expiry"]}>{batches.map((b) => <tr key={b.id}><td className={`${td} font-mono text-xs`}><Link className="text-brand hover:underline" href={`/trace?q=${encodeURIComponent(b.code)}`}>{b.code}</Link></td><td className={td}>{b.product.name}</td><td className={td}>{fmt(b.qtyOnHand)}</td><td className={td}>{b.expiryDate?.toLocaleDateString() ?? "—"}</td></tr>)}</Table>}
        </div>
      )}

      {unit && (
        <div className="space-y-5">
          <Card title={`Serial ${unit.serial}`} right={<div className="flex gap-2"><Badge s={unit.status} /><Link href={`/labels/serial/${unit.id}`} className={btn2}><Tag size={14} /> Label</Link></div>}>
            <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-4">
              <div><dt className="text-xs text-muted">Product</dt><dd>{unit.order.bom.product.name}</dd></div>
              <div><dt className="text-xs text-muted">Order</dt><dd><Link href={`/orders/${unit.orderId}`} className="font-mono text-brand hover:underline">{unit.order.no}</Link></dd></div>
              <div><dt className="text-xs text-muted">BOM</dt><dd>{unit.order.bom.name}</dd></div>
              <div><dt className="text-xs text-muted">Line</dt><dd>{unit.order.line?.name ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Model / gas / voltage</dt><dd>{[unit.order.bom.model, unit.order.bom.refrigerant, unit.order.bom.voltage].filter(Boolean).join(" · ")}</dd></div>
              <div><dt className="text-xs text-muted">Production lot</dt><dd className="font-mono text-xs">{unit.order.lotNo ?? "—"}</dd></div>
            </dl>
          </Card>

          <Card title="Operation history">
            <Table head={["#", "Operation", "Status", "Who (minutes)", "Equipment", "Readings", "Ended"]}>
              {unit.steps.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className={td}>{s.bomOp.seq}</td><td className={td}>{s.bomOp.operation.name}</td><td className={td}><Badge s={s.status} /></td>
                  <td className={td}>{s.time.map((t) => `${t.member.name} (${fmt(t.minutes, 0)})`).join(", ") || "—"}</td>
                  <td className={td}>{s.equipment.map((e) => e.asset.name).join(", ") || "—"}</td>
                  <td className={td}>{s.readings.map((r) => <div key={r.id} className={r.inRange ? "" : "font-semibold text-red-600"}>{r.parameter.name}: {fmt(r.value)} {r.parameter.unit}</div>)}</td>
                  <td className={td}>{s.endedAt?.toLocaleString() ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Material batches used (serial-specific and order-level)">
            <Table head={["Material", "Batch", "Qty", "Expiry", "Scope"]} empty={unit.consumptions.length + unitOrderBatches.length ? undefined : "No batch-tracked material recorded"}>
              {[...unit.consumptions.filter((c) => c.batch).map((c) => ({ c, scope: "this serial" })), ...unitOrderBatches.map((c) => ({ c, scope: "whole order" }))].map(({ c, scope }) => (
                <tr key={`${scope}${c.id}`}><td className={td}>{c.product.name}</td><td className={`${td} font-mono text-xs`}><Link className="text-brand hover:underline" href={`/trace?q=${encodeURIComponent(c.batch!.code)}`}>{c.batch!.code}</Link></td><td className={td}>{fmt(c.qty)}</td><td className={td}>{c.batch!.expiryDate?.toLocaleDateString() ?? "—"}</td><td className={td}>{scope}</td></tr>
              ))}
            </Table>
          </Card>

          {(unit.qc.length > 0 || unit.repairs.length > 0) && (
            <Card title="Quality & repairs">
              <ul className="space-y-1 text-sm">
                {unit.qc.map((q) => <li key={q.id}><Badge s={q.result === "PASS" ? "DONE" : "SCRAP"} label={q.result} /> {q.at.toLocaleString()} {q.failAction ? `· ${q.failAction}` : ""} {q.remark ? `· ${q.remark}` : ""}</li>)}
                {unit.repairs.map((r) => <li key={r.id}><Badge s={r.status} /> {r.issue}{r.fix ? ` → ${r.fix}` : ""}</li>)}
              </ul>
            </Card>
          )}
        </div>
      )}

      {batch && (
        <div className="space-y-5">
          <Card title={`Batch ${batch.code}`} right={<Link href={`/labels/batch/${batch.id}`} className={btn2}><Tag size={14} /> Label</Link>}>
            <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-4">
              <div><dt className="text-xs text-muted">Product</dt><dd>{batch.product.name}</dd></div>
              <div><dt className="text-xs text-muted">Received</dt><dd>{batch.receivedAt.toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-muted">Expiry</dt><dd className={batch.expiryDate && batch.expiryDate < new Date() ? "font-semibold text-red-600" : ""}>{batch.expiryDate?.toLocaleDateString() ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Supplier</dt><dd>{supplier?.name ?? (batch.orderId ? "Produced in-house" : "—")} {batch.supplierRef ? `· ${batch.supplierRef}` : ""}</dd></div>
              <div><dt className="text-xs text-muted">Quantity in</dt><dd>{fmt(batch.qtyIn)} {batch.product.uom}</dd></div>
              <div><dt className="text-xs text-muted">On hand</dt><dd>{fmt(batch.qtyOnHand)}</dd></div>
              <div><dt className="text-xs text-muted">Unit cost</dt><dd>{fmt(batch.unitCost)}</dd></div>
            </dl>
          </Card>

          {batch.consumptions.length > 0 && (
            <Card title={`Where this batch went (${affected.length} unit${affected.length === 1 ? "" : "s"} potentially affected)`}>
              <Table head={["Order", "Qty issued", "When", "Serial"]}>
                {batch.consumptions.map((c) => <tr key={c.id}><td className={`${td} font-mono`}><Link className="text-brand hover:underline" href={`/orders/${c.orderId}`}>{c.order.no}</Link></td><td className={td}>{fmt(c.qty)}</td><td className={td}>{c.at.toLocaleString()}</td><td className={`${td} font-mono text-xs`}>{c.unit?.serial ?? "whole order"}</td></tr>)}
              </Table>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {affected.map((u) => <Link key={u.id} href={`/trace?q=${encodeURIComponent(u.serial)}`} className="rounded border border-steel-200 bg-steel-50 px-2 py-0.5 font-mono text-[11px] hover:border-brand">{u.serial}</Link>)}
              </div>
            </Card>
          )}
          {lotUnits.length > 0 && (
            <Card title={`Units delivered in this production lot (${lotUnits.length})`}>
              <div className="flex flex-wrap gap-1.5">{lotUnits.map((u) => <Link key={u.id} href={`/trace?q=${encodeURIComponent(u.serial)}`} className="rounded border border-steel-200 bg-steel-50 px-2 py-0.5 font-mono text-[11px] hover:border-brand">{u.serial}</Link>)}</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
