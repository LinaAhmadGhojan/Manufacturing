import Link from "next/link";
import { Card, Field, btn, btn2, input } from "@/components/ui";

interface Opt { id: number; label: string }

export default function RequestForm({ action, boms, clients, init, submit }: {
  action: (fd: FormData) => Promise<void>; boms: Opt[]; clients: Opt[]; submit: string;
  init?: { bomId?: number; qty?: number; clientId?: number | null; salesRef?: string | null; priority?: number; dueDate?: Date | null; remark?: string | null };
}) {
  return (
    <form action={action} className="space-y-5">
      <Card title="Request">
        <div className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-3"><Field label="Product / BOM *"><select name="bomId" defaultValue={init?.bomId} className={input}>{boms.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field></div>
          <div className="md:col-span-1"><Field label="Quantity *"><input name="qty" type="number" min="1" step="any" defaultValue={init?.qty ?? 10} className={input} required /></Field></div>
          <div className="md:col-span-2"><Field label="Priority"><select name="priority" defaultValue={init?.priority ?? 2} className={input}><option value={1}>1 · High</option><option value={2}>2 · Normal</option><option value={3}>3 · Low</option></select></Field></div>
          <div className="md:col-span-3"><Field label="Client"><select name="clientId" defaultValue={init?.clientId ?? ""} className={input}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field></div>
          <div className="md:col-span-2"><Field label="Sales order ref."><input name="salesRef" defaultValue={init?.salesRef ?? ""} className={input} /></Field></div>
          <div className="md:col-span-1"><Field label="Due date"><input name="dueDate" type="date" defaultValue={init?.dueDate ? init.dueDate.toISOString().slice(0, 10) : ""} className={input} /></Field></div>
          <div className="md:col-span-6"><Field label="Remark"><textarea name="remark" rows={2} defaultValue={init?.remark ?? ""} className={input} /></Field></div>
        </div>
      </Card>
      <div className="flex gap-2"><button className={btn}>{submit}</button><Link href="/requests" className={btn2}>Cancel</Link></div>
    </form>
  );
}
