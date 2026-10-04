import Link from "next/link";
import { Inbox, Pencil, Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, ErrorBanner, PageHead, btn, btn2, fmt, input, td } from "@/components/ui";
import { ConfirmButton } from "@/components/Confirm";
import { acceptRequestAction, deleteRequestAction, rejectRequestAction } from "./actions";

export const dynamic = "force-dynamic";
const PRI: Record<number, [string, string]> = { 1: ["High", "bg-red-100 text-red-800"], 2: ["Normal", "bg-slate-100 text-slate-700"], 3: ["Low", "bg-sky-100 text-sky-800"] };

export default async function Requests({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const { error, status } = await searchParams;
  const [reqs, lines] = await Promise.all([
    db.productionRequest.findMany({ where: status ? { status: status as never } : undefined, orderBy: { id: "desc" }, include: { bom: { include: { product: true } }, order: true, client: true } }),
    db.productionLine.findMany({ where: { active: true } }),
  ]);
  return (
    <div>
      <PageHead title="Production requests" sub="Demand from sales or planning — accept to turn it into a production order" icon={Inbox}><Link href="/requests/new" className={btn}><Plus size={15} /> New request</Link></PageHead>
      <ErrorBanner error={error} />
      <div className="mb-3 flex gap-1.5">
        {["", "NEW", "ACCEPTED", "REJECTED"].map((s) => <Link key={s} href={s ? `/requests?status=${s}` : "/requests"} className={`rounded-full border px-3 py-1 text-xs ${(status ?? "") === s ? "border-brand bg-brand text-white" : "border-steel-200 bg-white text-muted hover:text-ink"}`}>{s || "ALL"}</Link>)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-left text-[11px] uppercase tracking-wider text-blue-100"><tr>{["Request", "Product", "Client / sales ref", "Qty", "Priority", "Due", "Status", "Order", "Actions"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-steel-100 [&>tr:hover]:bg-blue-50/40">
            {reqs.map((r) => (
              <tr key={r.id} className="align-top">
                <td className={`${td} font-mono text-xs`}>{r.no}</td>
                <td className={td}>{r.bom.product.name}<div className="text-xs text-muted">{r.bom.name}</div></td>
                <td className={td}>{r.client?.name ?? "—"}<div className="font-mono text-xs text-muted">{r.salesRef}</div></td>
                <td className={`${td} tabular-nums`}>{fmt(r.qty, 0)}</td>
                <td className={td}><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRI[r.priority][1]}`}>{PRI[r.priority][0]}</span></td>
                <td className={td}>{r.dueDate?.toLocaleDateString() ?? "—"}</td>
                <td className={td}><Badge s={r.status} /></td>
                <td className={td}>{r.order && <Link className="font-mono text-xs text-brand hover:underline" href={`/orders/${r.order.id}`}>{r.order.no}</Link>}</td>
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.status === "NEW" && (
                      <>
                        <form action={acceptRequestAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="id" value={r.id} />
                          <select name="lineId" className={`${input} w-32`}>{lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="release" defaultChecked className="accent-blue-600" /> release</label>
                          <button className={btn}>Accept</button>
                        </form>
                        <form action={rejectRequestAction}><input type="hidden" name="id" value={r.id} /><button className={btn2}>Reject</button></form>
                        <Link href={`/requests/${r.id}/edit`} className={`${btn2} !px-2`} title="Edit"><Pencil size={14} /></Link>
                      </>
                    )}
                    {r.status !== "ACCEPTED" && (
                      <form action={deleteRequestAction}><input type="hidden" name="id" value={r.id} /><ConfirmButton message="Delete this request?" className="rounded-md border border-red-200 p-1.5 text-red-700 hover:bg-red-50"><Trash2 size={14} /></ConfirmButton></form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!reqs.length && <div className="p-10 text-center text-sm text-muted">No requests.</div>}
      </div>
    </div>
  );
}
