"use client";

import { useMemo, useState } from "react";
import { btn, btn2, btnDanger, input, Field, fmt } from "@/components/ui";

type Opt = { id: number; name: string; avgCost?: number; hourRate?: number };
type QT = "FIXED" | "RATIO";
interface Mat { productId: number; qty: number; qtyType: QT; wastePct: number; essential: boolean; remark: string }
interface Op {
  operationId: number; hours: number; hoursType: QT; costPerHour: number; qcTemplateId: number | null; qcMandatory: boolean; remark: string;
  subProcessIds: number[];
  assets: { assetId: number; hours: number }[];
  expenses: { expenseTypeId: number; amount: number; amountType: QT }[];
  readings: { parameterId: number; min: number; max: number; mandatory: boolean }[];
}
export interface BomData {
  name: string; productId: number; outputQty: number; durationHrs: number; isDefault: boolean; serialBase: boolean; prodLevelQc: boolean;
  model: string; refrigerant: string; voltage: string; remark: string; materials: Mat[]; operations: Op[];
}
export interface Lookups { products: Opt[]; operations: Opt[]; templates: Opt[]; subProcesses: Opt[]; assets: Opt[]; parameters: Opt[]; expenseTypes: Opt[] }

const blankOp = (): Op => ({ operationId: 0, hours: 1, hoursType: "RATIO", costPerHour: 0, qcTemplateId: null, qcMandatory: false, remark: "", subProcessIds: [], assets: [], expenses: [], readings: [] });

export default function BomEditor({ initial, lookups: L, action, locked }: { initial: BomData; lookups: Lookups; action: (fd: FormData) => Promise<void>; locked?: boolean }) {
  const [d, setD] = useState<BomData>(initial);
  const set = <K extends keyof BomData>(k: K, v: BomData[K]) => setD((p) => ({ ...p, [k]: v }));
  const raws = L.products.filter((p) => p.id !== d.productId);

  const updMat = (i: number, patch: Partial<Mat>) => set("materials", d.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const updOp = (i: number, patch: Partial<Op>) => set("operations", d.operations.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const move = (i: number, dir: -1 | 1) => {
    const a = [...d.operations]; const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; set("operations", a);
  };
  const dup = (i: number) => set("operations", [...d.operations.slice(0, i + 1), JSON.parse(JSON.stringify(d.operations[i])), ...d.operations.slice(i + 1)]);

  const cost = useMemo(() => {
    const mat = d.materials.reduce((s, m) => s + m.qty * (1 + m.wastePct / 100) * (L.products.find((p) => p.id === m.productId)?.avgCost ?? 0), 0);
    let lab = 0, eq = 0, ex = 0;
    for (const o of d.operations) {
      lab += o.hours * o.costPerHour;
      eq += o.assets.reduce((s, a) => s + a.hours * (L.assets.find((x) => x.id === a.assetId)?.hourRate ?? 0), 0);
      ex += o.expenses.reduce((s, e) => s + e.amount, 0);
    }
    return { mat, lab, eq, ex };
  }, [d, L]);

  const sel = "w-full " + input;
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="payload" value={JSON.stringify(d)} />

      <section className="rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-navy-800">General</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="BOM name *"><input className={input} value={d.name} onChange={(e) => set("name", e.target.value)} required /></Field>
          <Field label="Finished product *">
            <select className={input} value={d.productId} onChange={(e) => set("productId", Number(e.target.value))}>
              <option value={0}>— select —</option>{L.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Output qty (BOM written for)"><input type="number" step="any" min="0" className={input} value={d.outputQty} onChange={(e) => set("outputQty", Number(e.target.value))} /></Field>
          <Field label="Duration (hrs)"><input type="number" step="any" min="0" className={input} value={d.durationHrs} onChange={(e) => set("durationHrs", Number(e.target.value))} /></Field>
          <Field label="Model (serial prefix)"><input className={input} value={d.model} onChange={(e) => set("model", e.target.value)} placeholder="e.g. SPL12" /></Field>
          <Field label="Refrigerant"><input className={input} value={d.refrigerant} onChange={(e) => set("refrigerant", e.target.value)} placeholder="R410A" /></Field>
          <Field label="Voltage"><input className={input} value={d.voltage} onChange={(e) => set("voltage", e.target.value)} placeholder="220V/50Hz" /></Field>
          <Field label="Remark"><input className={input} value={d.remark} onChange={(e) => set("remark", e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={d.isDefault} onChange={(e) => set("isDefault", e.target.checked)} /> Default BOM for this product</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={d.serialBase} onChange={(e) => set("serialBase", e.target.checked)} /> Serial based (one serial per unit)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-blue-600" checked={d.prodLevelQc} onChange={(e) => set("prodLevelQc", e.target.checked)} /> Unit-level QC</label>
        </div>
      </section>

      <section className="rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy-800">Raw materials ({d.materials.length})</h2>
          <button type="button" className={btn2} onClick={() => set("materials", [...d.materials, { productId: 0, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true, remark: "" }])}>+ Material</button>
        </div>
        <div className="space-y-2">
          {d.materials.map((m, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-steel-50 p-2">
              <Field label="Material"><select className={`${input} w-64`} value={m.productId} onChange={(e) => updMat(i, { productId: Number(e.target.value) })}><option value={0}>— select —</option>{raws.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Qty"><input type="number" step="any" min="0" className={`${input} w-24`} value={m.qty} onChange={(e) => updMat(i, { qty: Number(e.target.value) })} /></Field>
              <Field label="Type"><select className={input} value={m.qtyType} onChange={(e) => updMat(i, { qtyType: e.target.value as QT })}><option value="RATIO">Ratio (scales)</option><option value="FIXED">Fixed</option></select></Field>
              <Field label="Waste %"><input type="number" step="any" min="0" max="100" className={`${input} w-20`} value={m.wastePct} onChange={(e) => updMat(i, { wastePct: Number(e.target.value) })} /></Field>
              <Field label="Remark"><input className={`${input} w-40`} value={m.remark} onChange={(e) => updMat(i, { remark: e.target.value })} /></Field>
              <label className="flex items-center gap-1 pb-1.5 text-sm"><input type="checkbox" className="accent-blue-600" checked={m.essential} onChange={(e) => updMat(i, { essential: e.target.checked })} /> Essential</label>
              <button type="button" className={btnDanger} onClick={() => set("materials", d.materials.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy-800">Operations in order ({d.operations.length})</h2>
          <button type="button" className={btn2} onClick={() => set("operations", [...d.operations, blankOp()])}>+ Operation</button>
        </div>
        <div className="space-y-3">
          {d.operations.map((o, i) => (
            <details key={i} className="rounded-lg border border-steel-200" open={!o.operationId}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 bg-steel-50 px-3 py-2 text-sm">
                <b className="text-brand">{i + 1}.</b>
                <span className="font-medium">{L.operations.find((x) => x.id === o.operationId)?.name ?? "New operation"}</span>
                <span className="text-muted">· {o.hours} h {o.hoursType === "RATIO" ? "/unit" : "fixed"} @ {o.costPerHour}</span>
                {o.qcMandatory && <span className="rounded bg-violet-100 px-1.5 text-[11px] text-violet-800">QC</span>}
                {o.readings.length > 0 && <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">{o.readings.length} readings</span>}
                {o.assets.length > 0 && <span className="rounded bg-blue-100 px-1.5 text-[11px] text-brand">{o.assets.length} equipment</span>}
                <span className="ml-auto flex gap-1" onClick={(e) => e.preventDefault()}>
                  <button type="button" className={btn2} onClick={() => move(i, -1)}>↑</button><button type="button" className={btn2} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className={btn2} onClick={() => dup(i)}>Copy</button><button type="button" className={btnDanger} onClick={() => set("operations", d.operations.filter((_, j) => j !== i))}>✕</button>
                </span>
              </summary>
              <div className="space-y-4 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Operation"><select className={`${input} w-52`} value={o.operationId} onChange={(e) => updOp(i, { operationId: Number(e.target.value) })}><option value={0}>— select —</option>{L.operations.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                  <Field label="Hours"><input type="number" step="any" min="0" className={`${input} w-20`} value={o.hours} onChange={(e) => updOp(i, { hours: Number(e.target.value) })} /></Field>
                  <Field label="Hours type"><select className={input} value={o.hoursType} onChange={(e) => updOp(i, { hoursType: e.target.value as QT })}><option value="RATIO">Per unit</option><option value="FIXED">Fixed</option></select></Field>
                  <Field label="Labour cost / hr"><input type="number" step="any" min="0" className={`${input} w-24`} value={o.costPerHour} onChange={(e) => updOp(i, { costPerHour: Number(e.target.value) })} /></Field>
                  <Field label="QC template"><select className={`${input} w-52`} value={o.qcTemplateId ?? 0} onChange={(e) => updOp(i, { qcTemplateId: Number(e.target.value) || null })}><option value={0}>none</option>{L.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                  <label className="flex items-center gap-1 pb-1.5 text-sm"><input type="checkbox" className="accent-blue-600" checked={o.qcMandatory} onChange={(e) => updOp(i, { qcMandatory: e.target.checked })} /> QC mandatory</label>
                  <Field label="Remark"><input className={`${input} w-56`} value={o.remark} onChange={(e) => updOp(i, { remark: e.target.value })} /></Field>
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Sub-processes</div>
                  <div className="flex flex-wrap gap-2">
                    {L.subProcesses.map((s) => (
                      <label key={s.id} className="flex items-center gap-1 rounded-full border border-steel-200 px-2.5 py-0.5 text-xs">
                        <input type="checkbox" className="accent-blue-600" checked={o.subProcessIds.includes(s.id)} onChange={(e) => updOp(i, { subProcessIds: e.target.checked ? [...o.subProcessIds, s.id] : o.subProcessIds.filter((x) => x !== s.id) })} /> {s.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <Sub title="Equipment (hours per unit)" onAdd={() => updOp(i, { assets: [...o.assets, { assetId: L.assets[0]?.id ?? 0, hours: 0.25 }] })}>
                    {o.assets.map((a, k) => (
                      <div key={k} className="flex gap-1.5">
                        <select className={sel} value={a.assetId} onChange={(e) => updOp(i, { assets: o.assets.map((x, j) => (j === k ? { ...x, assetId: Number(e.target.value) } : x)) })}>{L.assets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                        <input type="number" step="any" min="0" className={`${input} w-20`} value={a.hours} onChange={(e) => updOp(i, { assets: o.assets.map((x, j) => (j === k ? { ...x, hours: Number(e.target.value) } : x)) })} />
                        <button type="button" className={btnDanger} onClick={() => updOp(i, { assets: o.assets.filter((_, j) => j !== k) })}>✕</button>
                      </div>
                    ))}
                  </Sub>
                  <Sub title="Expenses" onAdd={() => updOp(i, { expenses: [...o.expenses, { expenseTypeId: L.expenseTypes[0]?.id ?? 0, amount: 0, amountType: "RATIO" }] })}>
                    {o.expenses.map((a, k) => (
                      <div key={k} className="flex gap-1.5">
                        <select className={sel} value={a.expenseTypeId} onChange={(e) => updOp(i, { expenses: o.expenses.map((x, j) => (j === k ? { ...x, expenseTypeId: Number(e.target.value) } : x)) })}>{L.expenseTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                        <input type="number" step="any" min="0" className={`${input} w-20`} value={a.amount} onChange={(e) => updOp(i, { expenses: o.expenses.map((x, j) => (j === k ? { ...x, amount: Number(e.target.value) } : x)) })} />
                        <select className={input} value={a.amountType} onChange={(e) => updOp(i, { expenses: o.expenses.map((x, j) => (j === k ? { ...x, amountType: e.target.value as QT } : x)) })}><option value="RATIO">/unit</option><option value="FIXED">fixed</option></select>
                        <button type="button" className={btnDanger} onClick={() => updOp(i, { expenses: o.expenses.filter((_, j) => j !== k) })}>✕</button>
                      </div>
                    ))}
                  </Sub>
                  <Sub title="Readings (min–max)" onAdd={() => updOp(i, { readings: [...o.readings, { parameterId: L.parameters[0]?.id ?? 0, min: 0, max: 0, mandatory: false }] })}>
                    {o.readings.map((a, k) => (
                      <div key={k} className="flex flex-wrap items-center gap-1.5">
                        <select className={sel} value={a.parameterId} onChange={(e) => updOp(i, { readings: o.readings.map((x, j) => (j === k ? { ...x, parameterId: Number(e.target.value) } : x)) })}>{L.parameters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                        <input type="number" step="any" className={`${input} w-16`} value={a.min} onChange={(e) => updOp(i, { readings: o.readings.map((x, j) => (j === k ? { ...x, min: Number(e.target.value) } : x)) })} />
                        <input type="number" step="any" className={`${input} w-16`} value={a.max} onChange={(e) => updOp(i, { readings: o.readings.map((x, j) => (j === k ? { ...x, max: Number(e.target.value) } : x)) })} />
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-blue-600" checked={a.mandatory} onChange={(e) => updOp(i, { readings: o.readings.map((x, j) => (j === k ? { ...x, mandatory: e.target.checked } : x)) })} /> req.</label>
                        <button type="button" className={btnDanger} onClick={() => updOp(i, { readings: o.readings.filter((_, j) => j !== k) })}>✕</button>
                      </div>
                    ))}
                  </Sub>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-steel-200 bg-white p-4 text-sm shadow-lg">
        <div>Cost for {fmt(d.outputQty)} unit(s): materials <b>{fmt(cost.mat)}</b> · labour <b>{fmt(cost.lab)}</b> · equipment <b>{fmt(cost.eq)}</b> · expenses <b>{fmt(cost.ex)}</b> · total <b className="text-brand">{fmt(cost.mat + cost.lab + cost.eq + cost.ex)}</b></div>
        <button className={btn} disabled={locked}>{locked ? "Locked (used by orders)" : "Save BOM"}</button>
      </div>
    </form>
  );
}

function Sub({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-steel-200 p-2">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted">{title}</span><button type="button" className={`${btn2} !py-0.5 text-xs`} onClick={onAdd}>+ Add</button></div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
