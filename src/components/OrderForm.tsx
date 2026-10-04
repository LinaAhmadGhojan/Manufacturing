import Link from "next/link";
import { Card, Field, btn, btn2, input } from "@/components/ui";

interface Opt { id: number; label: string }
interface Init { bomId?: number; qty?: number; lineId?: number | null; priority?: number; plannedStart?: Date | null; plannedEnd?: Date | null; remark?: string | null }

const d = (v?: Date | null) => (v ? v.toISOString().slice(0, 10) : "");

export default function OrderForm({ action, boms, lines, init, cancelHref, submit }: { action: (fd: FormData) => Promise<void>; boms: Opt[]; lines: Opt[]; init?: Init; cancelHref: string; submit: string }) {
  return (
    <form action={action} className="space-y-5">
      <Card title="Order">
        <div className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-3"><Field label="BOM (product & routing) *"><select name="bomId" defaultValue={init?.bomId} className={input}>{boms.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field></div>
          <div className="md:col-span-1"><Field label="Quantity *"><input name="qty" type="number" min="1" step="any" defaultValue={init?.qty ?? 10} className={input} required /></Field></div>
          <div className="md:col-span-2"><Field label="Priority"><select name="priority" defaultValue={init?.priority ?? 2} className={input}><option value={1}>1 · High</option><option value={2}>2 · Normal</option><option value={3}>3 · Low</option></select></Field></div>
          <div className="md:col-span-3"><Field label="Production line"><select name="lineId" defaultValue={init?.lineId ?? ""} className={input}><option value="">—</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></Field></div>
          <div className="md:col-span-1"><Field label="Planned start"><input name="plannedStart" type="date" defaultValue={d(init?.plannedStart)} className={input} /></Field></div>
          <div className="md:col-span-2"><Field label="Planned end"><input name="plannedEnd" type="date" defaultValue={d(init?.plannedEnd)} className={input} /></Field></div>
          <div className="md:col-span-6"><Field label="Remark"><textarea name="remark" rows={2} defaultValue={init?.remark ?? ""} className={input} /></Field></div>
        </div>
      </Card>
      <p className="text-xs text-muted">Materials, operations and costs are calculated from the BOM when you save.</p>
      <div className="flex gap-2"><button className={btn}>{submit}</button><Link href={cancelHref} className={btn2}>Cancel</Link></div>
    </form>
  );
}
