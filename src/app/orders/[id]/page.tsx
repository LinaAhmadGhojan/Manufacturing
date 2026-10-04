import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Play, PauseCircle, PlayCircle, CheckCheck, Trash2, PackageCheck, Pencil, Printer, Tag, ShoppingCart, X } from "lucide-react";
import { db } from "@/lib/db";
import { actualTotal, plannedTotal, receivable } from "@/lib/exec";
import { Badge, Card, ErrorBanner, Field, Kpi, PageHead, Progress, Table, Tabs, btn, btn2, btnDanger, fmt, input, td } from "@/components/ui";
import { ConfirmButton } from "@/components/Confirm";
import {
  addMaterialAction, closeAction, consumeAction, deleteExpenseAction, deleteOrderAction, expenseAction, purchaseRequestAction,
  receiveAction, releaseOrderAction, removeMaterialAction, suspendAction, unsuspendAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string }> }) {
  const { id } = await params;
  const { tab = "overview", error } = await searchParams;
  const po = await db.productionOrder.findUnique({
    where: { id: Number(id) },
    include: {
      bom: { include: { product: true, operations: { include: { operation: true, qcTemplate: true, subs: { include: { subProcess: true } }, assets: { include: { asset: true } }, expenses: { include: { expenseType: true } }, readings: { include: { parameter: true } } }, orderBy: { seq: "asc" } } } },
      line: true, branch: true, request: { include: { client: true } },
      materials: { include: { product: true } },
      units: { include: { steps: { include: { bomOp: { include: { operation: true } }, time: { include: { member: true } }, equipment: { include: { asset: true } }, readings: { include: { parameter: true } } } } }, orderBy: { id: "asc" } },
      moves: { include: { product: true, batch: true }, orderBy: { id: "desc" } },
      expenses: { include: { expenseType: true }, orderBy: { id: "desc" } },
      receipts: { orderBy: { id: "desc" } },
      consumptions: { include: { product: true, batch: true, unit: true }, orderBy: { id: "desc" } },
    },
  });
  if (!po) notFound();
  const live = po.status === "RELEASED";
  const info = po.status === "RELEASED" || po.status === "SUSPENDED" ? await receivable(po.id) : { qty: 0, received: 0, serialBase: po.bom.serialBase };
  const batchProducts = po.materials.filter((m) => m.product.requireBatch).map((m) => m.productId);
  const batches = batchProducts.length ? await db.batch.findMany({ where: { productId: { in: batchProducts }, qtyOnHand: { gt: 0 } }, orderBy: [{ expiryDate: "asc" }, { id: "asc" }] }) : [];
  const allProducts = po.status !== "CLOSED" ? await db.product.findMany({ where: { active: true, kind: { not: "FINISHED" } }, orderBy: { name: "asc" } }) : [];
  const expTypes = await db.expenseType.findMany();
  const pl = plannedTotal(po), ac = actualTotal(po);
  const base = `/orders/${po.id}`;
  const hid = <input type="hidden" name="id" value={po.id} />;
  const times = po.units.flatMap((u) => u.steps.flatMap((s) => s.time.map((t) => ({ ...t, serial: u.serial, op: s.bomOp.operation.name }))));
  const equip = po.units.flatMap((u) => u.steps.flatMap((s) => s.equipment.map((t) => ({ ...t, serial: u.serial, op: s.bomOp.operation.name }))));
  const reads = po.units.flatMap((u) => u.steps.flatMap((s) => s.readings.map((t) => ({ ...t, serial: u.serial, op: s.bomOp.operation.name }))));
  const done = po.units.filter((u) => ["DONE", "DELIVERED"].includes(u.status)).length;
  const now = new Date();

  return (
    <div>
      <PageHead title={`${po.no} · ${po.bom.product.name}`} sub={`BOM ${po.bom.name} · ${po.line?.name ?? "no line"}${po.branch ? ` · ${po.branch.name}` : ""}${po.request ? ` · from ${po.request.no}${po.request.client ? ` (${po.request.client.name})` : ""}` : ""}`} icon={ClipboardList}>
        <Badge s={po.status} />
        {po.units.length > 0 && <Link href={`/labels/order/${po.id}`} className={btn2}><Tag size={14} /> Serial labels</Link>}
        {po.status === "DRAFT" && (
          <>
            <Link href={`${base}/edit`} className={btn2}><Pencil size={14} /> Edit</Link>
            <form action={releaseOrderAction}>{hid}<button className={btn}><Play size={14} /> Release</button></form>
            <form action={deleteOrderAction}>{hid}<ConfirmButton message="Delete this draft order?" className={btnDanger}><Trash2 size={14} /></ConfirmButton></form>
          </>
        )}
        {live && <form action={suspendAction}>{hid}<button className={btn2}><PauseCircle size={14} /> Suspend</button></form>}
        {po.status === "SUSPENDED" && <form action={unsuspendAction}>{hid}<button className={btn}><PlayCircle size={14} /> Resume</button></form>}
      </PageHead>
      <ErrorBanner error={error} />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Produced" value={`${fmt(po.producedQty, 0)}/${fmt(po.plannedQty, 0)}`} icon={PackageCheck} hint={`${info.qty} ready to receive`} />
        <Kpi label="Units complete" value={`${done}/${po.units.length}`} icon={CheckCheck} hint={po.lotNo ? `Lot ${po.lotNo}` : undefined} />
        <Kpi label="Planned cost" value={fmt(pl, 0)} icon={ClipboardList} hint={`mat ${fmt(po.plannedMaterialCost, 0)} · res ${fmt(po.plannedLaborCost, 0)} · exp ${fmt(po.plannedExpenseCost, 0)}`} />
        <Kpi label="Actual cost" value={fmt(ac, 0)} icon={ClipboardList} warn={pl > 0 && ac > pl} hint={`mat ${fmt(po.actualMaterialCost, 0)} · res ${fmt(po.actualLaborCost, 0)} · exp ${fmt(po.actualExpenseCost, 0)}`} />
      </div>

      <Tabs base={base} current={tab} tabs={[["overview", "Overview"], ["materials", "Materials"], ["units", "Serials & operations"], ["manpower", "Manpower & equipment"], ["readings", "Readings"], ["expenses", "Expenses"], ["receive", "Receive & close"], ["moves", "Stock ledger"]]} />

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Routing">
            <ol className="space-y-3 text-sm">
              {po.bom.operations.map((o) => {
                const k = po.plannedQty / po.bom.outputQty;
                return (
                  <li key={o.id} className="border-b border-steel-100 pb-2">
                    <div className="flex items-center justify-between">
                      <span><b className="text-brand">{o.seq}.</b> {o.operation.name}{o.qcTemplate && o.qcMandatory && <span className="ml-2 rounded bg-violet-100 px-1.5 text-[11px] text-violet-800">QC: {o.qcTemplate.name}</span>}{o.operation.requiresVerify && <span className="ml-2 rounded bg-indigo-100 px-1.5 text-[11px] text-indigo-800">verify</span>}</span>
                      <span className="text-muted">{fmt(o.hoursType === "RATIO" ? o.hours * k : o.hours, 1)} h</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted">
                      {o.subs.map((s) => <span key={s.subProcessId} className="rounded bg-steel-100 px-1.5">{s.subProcess.name}</span>)}
                      {o.assets.map((a) => <span key={a.id} className="rounded bg-blue-50 px-1.5 text-brand">{a.asset.name}</span>)}
                      {o.readings.map((r) => <span key={r.id} className="rounded bg-amber-50 px-1.5 text-amber-800">{r.parameter.name}{r.mandatory ? "*" : ""}</span>)}
                      {o.expenses.map((e) => <span key={e.id} className="rounded bg-emerald-50 px-1.5 text-emerald-800">{e.expenseType.name}</span>)}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
          <Card title="Details">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Mode</dt><dd>{po.bom.serialBase ? "Serial based" : "Batch"}</dd>
              <dt className="text-muted">Priority</dt><dd>{["", "High", "Normal", "Low"][po.priority]}</dd>
              <dt className="text-muted">Model / refrigerant / voltage</dt><dd>{[po.bom.model, po.bom.refrigerant, po.bom.voltage].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-muted">Planned</dt><dd>{po.plannedStart?.toLocaleDateString() ?? "—"} → {po.plannedEnd?.toLocaleDateString() ?? "—"}{po.status === "RELEASED" && po.plannedEnd && po.plannedEnd < now && <b className="ml-2 text-red-600">overdue</b>}</dd>
              <dt className="text-muted">Production lot</dt><dd className="font-mono text-xs">{po.lotNo ?? "—"}</dd>
              <dt className="text-muted">Closed</dt><dd>{po.closedAt ? `${po.closedAt.toLocaleDateString()} — ${po.closeReason ?? ""}` : "—"}</dd>
              <dt className="text-muted">Remark</dt><dd>{po.remark ?? "—"}</dd>
            </dl>
            <div className="mt-4"><Progress value={po.producedQty} max={po.plannedQty} /></div>
          </Card>
        </div>
      )}

      {tab === "materials" && (
        <div className="space-y-5">
          <Table head={["Material", "Type", "Planned", "Used", "Remaining", "On hand", "Unit cost", "Usage", ...(live ? ["Issue material"] : []), ""]}>
            {po.materials.map((m) => {
              const remaining = Math.max(0, m.plannedQty - m.usedQty);
              const short = remaining - m.product.qtyOnHand;
              const mine = batches.filter((b) => b.productId === m.productId);
              return (
                <tr key={m.id} className="align-top">
                  <td className={td}>{m.product.name}<div className="font-mono text-[11px] text-muted">{m.product.code}{!m.essential && " · optional"}{m.product.requireBatch && " · batch"}</div></td>
                  <td className={td}>{m.qtyType.toLowerCase()}</td>
                  <td className={`${td} tabular-nums`}>{fmt(m.plannedQty)} {m.product.uom}</td>
                  <td className={`${td} tabular-nums`}>{fmt(m.usedQty)}</td>
                  <td className={`${td} tabular-nums`}>{fmt(remaining)}</td>
                  <td className={`${td} tabular-nums ${short > 0 ? "font-semibold text-red-600" : ""}`}>
                    {fmt(m.product.qtyOnHand)}
                    {short > 0 && live && (
                      <form action={purchaseRequestAction} className="mt-1"><input type="hidden" name="orderId" value={po.id} /><input type="hidden" name="productId" value={m.productId} /><input type="hidden" name="qty" value={Math.ceil(short)} />
                        <button className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"><ShoppingCart size={11} /> Request {fmt(Math.ceil(short), 0)}</button></form>
                    )}
                  </td>
                  <td className={`${td} tabular-nums`}>{fmt(m.unitCost)}</td>
                  <td className={`${td} w-32`}><Progress value={m.usedQty} max={m.plannedQty} /></td>
                  {live && (
                    <td className={td}>
                      {remaining > 0 && (
                        <form action={consumeAction} className="flex flex-wrap gap-1">
                          <input type="hidden" name="orderId" value={po.id} /><input type="hidden" name="productId" value={m.productId} />
                          <input name="qty" type="number" step="any" min="0" defaultValue={Math.min(remaining, m.product.qtyOnHand).toFixed(3).replace(/\.?0+$/, "")} className={`${input} w-20`} />
                          {m.product.requireBatch && (
                            <select name="batchId" className={`${input} w-40`} required>
                              {mine.map((b) => <option key={b.id} value={b.id} disabled={!!b.expiryDate && b.expiryDate < now}>{b.code} · {fmt(b.qtyOnHand)}{b.expiryDate ? ` · exp ${b.expiryDate.toLocaleDateString()}` : ""}{b.expiryDate && b.expiryDate < now ? " (expired)" : ""}</option>)}
                            </select>
                          )}
                          {po.bom.serialBase && (
                            <select name="unitId" className={`${input} w-28`}><option value="">whole order</option>{po.units.map((u) => <option key={u.id} value={u.id}>{u.serial.slice(-9)}</option>)}</select>
                          )}
                          <button className={btn}>Issue</button>
                        </form>
                      )}
                    </td>
                  )}
                  <td className={td}>
                    {m.usedQty === 0 && po.status !== "CLOSED" && (
                      <form action={removeMaterialAction}><input type="hidden" name="orderId" value={po.id} /><input type="hidden" name="id" value={m.id} />
                        <ConfirmButton message="Remove this material from the order?" className="rounded border border-red-200 p-1 text-red-700 hover:bg-red-50"><X size={13} /></ConfirmButton></form>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>

          {po.status !== "CLOSED" && (
            <Card title="Add extra material to this order">
              <form action={addMaterialAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="orderId" value={po.id} />
                <Field label="Product"><select name="productId" className={`${input} w-72`}>{allProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select></Field>
                <Field label="Quantity"><input name="qty" type="number" min="0" step="any" className={`${input} w-28`} required /></Field>
                <button className={btn}>Add material</button>
              </form>
            </Card>
          )}

          <h3 className="text-sm font-semibold text-navy-800">Issued materials (batch traceability)</h3>
          <Table head={["When", "Material", "Qty", "Batch", "Expiry", "For serial", "Cost"]} empty={po.consumptions.length ? undefined : "Nothing issued yet"}>
            {po.consumptions.map((c) => (
              <tr key={c.id}>
                <td className={td}>{c.at.toLocaleString()}</td><td className={td}>{c.product.name}</td><td className={`${td} tabular-nums`}>{fmt(c.qty)}</td>
                <td className={`${td} font-mono text-xs`}>{c.batch ? <Link href={`/trace?q=${encodeURIComponent(c.batch.code)}`} className="text-brand hover:underline">{c.batch.code}</Link> : "—"}</td>
                <td className={td}>{c.batch?.expiryDate?.toLocaleDateString() ?? "—"}</td><td className={`${td} font-mono text-xs`}>{c.unit?.serial ?? "whole order"}</td><td className={`${td} tabular-nums`}>{fmt(c.qty * c.unitCost)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === "units" && (
        <Table head={["Serial / batch", "Status", ...po.bom.operations.map((o) => o.operation.shortName ?? o.operation.name), ""]} empty={po.units.length ? undefined : "Release the order to generate serials and operations"}>
          {po.units.map((u) => (
            <tr key={u.id}>
              <td className={`${td} font-mono text-xs`}><Link href={`/trace?q=${encodeURIComponent(u.serial)}`} className="text-brand hover:underline">{u.serial}</Link></td>
              <td className={td}><Badge s={u.status} /></td>
              {po.bom.operations.map((o) => { const s = u.steps.find((x) => x.bomOpId === o.id); return <td key={o.id} className={td}>{s ? <Badge s={s.status} /> : "—"}</td>; })}
              <td className={td}><Link href={`/labels/serial/${u.id}`} className="text-muted hover:text-brand" title="Print label"><Printer size={15} /></Link></td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "manpower" && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-navy-800">Labour</h3>
          <Table head={["When", "Serial", "Operation", "Employee", "Minutes", "Rate", "Cost"]} empty={times.length ? undefined : "No time logged — use the Shop floor screen"}>
            {times.map((t) => <tr key={t.id}><td className={td}>{t.at.toLocaleString()}</td><td className={`${td} font-mono text-xs`}>{t.serial}</td><td className={td}>{t.op}</td><td className={td}>{t.member.name}</td><td className={td}>{fmt(t.minutes, 0)}</td><td className={td}>{fmt(t.hourRate)}</td><td className={td}>{fmt(t.cost)}</td></tr>)}
          </Table>
          <h3 className="text-sm font-semibold text-navy-800">Equipment</h3>
          <Table head={["When", "Serial", "Operation", "Equipment", "Minutes", "Rate", "Cost"]} empty={equip.length ? undefined : "No equipment time logged"}>
            {equip.map((t) => <tr key={t.id}><td className={td}>{t.at.toLocaleString()}</td><td className={`${td} font-mono text-xs`}>{t.serial}</td><td className={td}>{t.op}</td><td className={td}>{t.asset.name}</td><td className={td}>{fmt(t.minutes, 0)}</td><td className={td}>{fmt(t.rate)}</td><td className={td}>{fmt(t.cost)}</td></tr>)}
          </Table>
        </div>
      )}

      {tab === "readings" && (
        <Table head={["When", "Serial", "Operation", "Parameter", "Value", "Unit", "Result"]} empty={reads.length ? undefined : "No readings captured"}>
          {reads.map((r) => <tr key={r.id}><td className={td}>{r.at.toLocaleString()}</td><td className={`${td} font-mono text-xs`}>{r.serial}</td><td className={td}>{r.op}</td><td className={td}>{r.parameter.name}</td><td className={`${td} tabular-nums`}>{fmt(r.value)}</td><td className={td}>{r.parameter.unit}</td><td className={td}><Badge s={r.inRange ? "DONE" : "SCRAP"} /> {r.inRange ? "in range" : "out of range"}</td></tr>)}
        </Table>
      )}

      {tab === "expenses" && (
        <div className="space-y-5">
          {live && (
            <Card title="Add expense">
              <form action={expenseAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="orderId" value={po.id} />
                <Field label="Type"><select name="expenseTypeId" className={input}><option value="">—</option>{expTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                <Field label="Description"><input name="name" className={`${input} w-56`} /></Field>
                <Field label="Amount"><input name="amount" type="number" step="any" min="0" className={`${input} w-28`} required /></Field>
                <button className={btn}>Add</button>
              </form>
            </Card>
          )}
          <Table head={["When", "Type", "Description", "Amount", ""]} empty={po.expenses.length ? undefined : "No expenses"}>
            {po.expenses.map((e) => (
              <tr key={e.id}><td className={td}>{e.at.toLocaleString()}</td><td className={td}>{e.expenseType?.name ?? "—"}</td><td className={td}>{e.name}</td><td className={td}>{fmt(e.amount)}</td>
                <td className={td}>{live && <form action={deleteExpenseAction}><input type="hidden" name="orderId" value={po.id} /><input type="hidden" name="id" value={e.id} /><ConfirmButton message="Delete this expense?" className="rounded border border-red-200 p-1 text-red-700 hover:bg-red-50"><Trash2 size={13} /></ConfirmButton></form>}</td></tr>
            ))}
            {po.expenses.length > 0 && <tr><td className={td} colSpan={3}><b>Total</b></td><td className={td}><b>{fmt(po.expenses.reduce((s, e) => s + e.amount, 0))}</b></td><td /></tr>}
          </Table>
        </div>
      )}

      {tab === "receive" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Receive finished goods into stock">
            <p className="mb-3 text-sm text-muted">Ready now: <b className="text-ink">{fmt(info.qty, 0)}</b> {po.bom.product.uom}. Limited by the scarcest essential material consumed{info.serialBase ? " and by serials that finished all operations" : " and by all operations being complete"}. Received goods go into lot <span className="font-mono">{po.lotNo ?? `LOT-${po.no}`}</span>.</p>
            {live ? (
              <form action={receiveAction} className="flex items-end gap-3">
                <input type="hidden" name="orderId" value={po.id} />
                <Field label="Qty (blank = all ready)"><input name="qty" type="number" step="any" min="0" className={`${input} w-32`} /></Field>
                <button className={btn} disabled={info.qty <= 0}>Receive</button>
              </form>
            ) : <p className="text-sm text-muted">Order must be released to receive.</p>}
            <ul className="mt-4 divide-y divide-steel-100 text-sm">{po.receipts.slice(0, 12).map((r) => <li key={r.id} className="flex justify-between py-1.5"><span>{r.at.toLocaleString()}</span><span>{fmt(r.qty, 0)} @ {fmt(r.unitCost)}</span></li>)}</ul>
            {po.lotNo && <Link href={`/labels/lot/${po.id}`} className={`${btn2} mt-3`}><Tag size={14} /> Print lot label</Link>}
          </Card>
          <Card title="Close order">
            <p className="mb-3 text-sm text-muted">Closing requires everything receivable to be received. Unconsumed committed materials are released and unstarted units are locked.</p>
            {live ? (
              <form action={closeAction} className="flex items-end gap-3">{hid}<Field label="Reason"><input name="reason" list="close-reasons" className={`${input} w-56`} /></Field><button className={btn}><CheckCheck size={14} /> Close order</button></form>
            ) : <p className="text-sm text-muted">Status: {po.status}</p>}
            <datalist id="close-reasons"><option>Order completed</option><option>Customer cancelled</option><option>Quantity reduced</option></datalist>
          </Card>
        </div>
      )}

      {tab === "moves" && (
        <Table head={["When", "Type", "Product", "Batch", "Qty", "Unit cost", "Note"]} empty={po.moves.length ? undefined : "No stock movements"}>
          {po.moves.map((m) => (
            <tr key={m.id}><td className={td}>{m.at.toLocaleString()}</td><td className={td}><Badge s={m.type === "RECEIVE" ? "DELIVERED" : m.type === "CONSUME" ? "IN_PROGRESS" : m.type === "COMMIT" ? "NEW" : "PENDING"} /> <span className="text-xs">{m.type}</span></td>
              <td className={td}>{m.product.name}</td><td className={`${td} font-mono text-xs`}>{m.batch?.code ?? ""}</td><td className={`${td} tabular-nums`}>{fmt(m.qty)}</td><td className={`${td} tabular-nums`}>{fmt(m.unitCost)}</td><td className={td}>{m.note ?? ""}</td></tr>
          ))}
        </Table>
      )}
    </div>
  );
}
