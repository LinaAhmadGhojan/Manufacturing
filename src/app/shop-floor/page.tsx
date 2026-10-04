import Link from "next/link";
import { HardHat, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, ErrorBanner, PageHead, Progress, btn, btn2, fmt, input } from "@/components/ui";
import { completeStepAction, logEquipmentAction, logTimeAction, readingAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ShopFloor({ searchParams }: { searchParams: Promise<{ order?: string; unit?: string; error?: string }> }) {
  const { order, unit: onlyUnit, error } = await searchParams;
  const orders = await db.productionOrder.findMany({ where: { status: "RELEASED" }, include: { bom: { include: { product: true } }, line: true }, orderBy: [{ priority: "asc" }, { id: "desc" }] });
  const sel = orders.find((o) => o.id === Number(order)) ?? orders[0];
  const [units, allActive, members] = await Promise.all([
    sel ? db.productionUnit.findMany({
      where: { orderId: sel.id, status: { notIn: ["DELIVERED", "SCRAP"] }, ...(onlyUnit ? { id: Number(onlyUnit) } : {}) },
      include: { steps: { include: { bomOp: { include: { operation: true, assets: { include: { asset: true } }, readings: { include: { parameter: true } } } }, time: true, readings: true, equipment: true }, orderBy: { bomOp: { seq: "asc" } } } },
      orderBy: { id: "asc" },
      take: onlyUnit ? 1 : 6,
    }) : [],
    sel ? db.productionUnit.findMany({ where: { orderId: sel.id, status: { notIn: ["DELIVERED", "SCRAP"] } }, select: { id: true, serial: true, status: true }, orderBy: { id: "asc" } }) : [],
    db.teamMember.findMany({ where: { active: true }, include: { allowedOps: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHead title="Shop floor" sub="Technician workstation — readings, time and equipment, then complete operations in sequence" icon={HardHat} />
      <ErrorBanner error={error} />
      <div className="mb-4 flex flex-wrap gap-2">
        {orders.map((o) => (
          <Link key={o.id} href={`/shop-floor?order=${o.id}`} className={`rounded-lg border px-3 py-2 text-sm ${sel?.id === o.id ? "border-brand bg-blue-50" : "border-steel-200 bg-white"}`}>
            <div className="font-mono text-xs text-brand">{o.no}{o.priority === 1 && <b className="ml-1 text-red-600">!</b>}</div><div>{o.bom.product.name}</div><div className="text-xs text-muted">{o.line?.name}</div>
          </Link>
        ))}
        {!orders.length && <p className="text-sm text-muted">No released orders. Release one from Production orders.</p>}
      </div>

      {sel && allActive.length > units.length && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Showing {units.length} of {allActive.length} active units — jump to:</span>
          {allActive.map((u) => <Link key={u.id} href={`/shop-floor?order=${sel.id}&unit=${u.id}`} className="rounded border border-steel-200 bg-white px-2 py-0.5 font-mono hover:border-brand">{u.serial.slice(-9)}</Link>)}
          {onlyUnit && <Link href={`/shop-floor?order=${sel.id}`} className="text-brand hover:underline">show first 6</Link>}
        </div>
      )}

      {sel && (
        <div className="space-y-3">
          {units.map((u) => {
            const doneCount = u.steps.filter((s) => s.status === "DONE").length;
            return (
              <Card key={u.id} title={u.serial} right={<div className="flex items-center gap-2"><Badge s={u.status} /><Link href={`/labels/serial/${u.id}`} className="text-muted hover:text-brand" title="Print serial label"><Printer size={15} /></Link></div>}>
                <div className="mb-3"><Progress value={doneCount} max={u.steps.length} /></div>
                <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {u.steps.map((s) => {
                    const minutes = s.time.reduce((a, t) => a + t.minutes, 0);
                    const open = ["PENDING", "IN_PROGRESS"].includes(s.status);
                    const allowed = members.filter((m) => !m.allowedOps.length || m.allowedOps.some((a) => a.operationId === s.bomOp.operationId));
                    return (
                      <li key={s.id} className="rounded-lg border border-steel-200 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium"><span className="text-brand">{s.bomOp.seq}.</span> {s.bomOp.operation.name}</span><Badge s={s.status} />
                        </div>
                        <div className="mb-2 text-xs text-muted">{fmt(minutes, 0)} min · {s.equipment.length} equipment entries · {s.readings.length}/{s.bomOp.readings.length} readings</div>
                        {open && (
                          <div className="space-y-2">
                            {s.bomOp.readings.map((r) => {
                              const last = [...s.readings].reverse().find((x) => x.parameterId === r.parameterId);
                              return (
                                <form key={r.id} action={readingAction} className="flex items-center gap-1.5">
                                  <input type="hidden" name="order" value={sel.id} /><input type="hidden" name="stepId" value={s.id} /><input type="hidden" name="parameterId" value={r.parameterId} />
                                  <span className="w-28 shrink-0 truncate text-xs" title={r.parameter.name}>{r.parameter.name}{r.mandatory ? " *" : ""}</span>
                                  <input name="value" type="number" step="any" placeholder={r.max > r.min ? `${r.min}–${r.max}` : "value"} className={`${input} w-20`} required />
                                  <span className="text-xs text-muted">{r.parameter.unit}</span>
                                  <button className={`${btn2} !px-2 !py-1`}>Save</button>
                                  {last && <span className={`text-xs ${last.inRange ? "text-emerald-600" : "font-semibold text-red-600"}`}>{fmt(last.value)}</span>}
                                </form>
                              );
                            })}
                            <form action={logTimeAction} className="flex gap-1.5">
                              <input type="hidden" name="order" value={sel.id} /><input type="hidden" name="stepId" value={s.id} />
                              <select name="memberId" className={`${input} min-w-0 flex-1`}>{allowed.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                              <input name="minutes" type="number" min="1" placeholder="min" className={`${input} w-16`} required />
                              <button className={btn2}>Log time</button>
                            </form>
                            {s.bomOp.assets.length > 0 && (
                              <form action={logEquipmentAction} className="flex gap-1.5">
                                <input type="hidden" name="order" value={sel.id} /><input type="hidden" name="stepId" value={s.id} />
                                <select name="assetId" className={`${input} min-w-0 flex-1`}>{s.bomOp.assets.map((a) => <option key={a.id} value={a.assetId}>{a.asset.name}</option>)}</select>
                                <input name="minutes" type="number" min="1" placeholder="min" className={`${input} w-16`} required />
                                <button className={btn2}>Log equip.</button>
                              </form>
                            )}
                            <form action={completeStepAction}><input type="hidden" name="order" value={sel.id} /><input type="hidden" name="stepId" value={s.id} /><button className={`${btn} w-full justify-center`}>Complete operation</button></form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </Card>
            );
          })}
          {!units.length && <p className="text-sm text-muted">No active units for this order.</p>}
        </div>
      )}
    </div>
  );
}
