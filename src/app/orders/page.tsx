import Link from "next/link";
import { ClipboardList, Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { actualTotal, plannedTotal } from "@/lib/exec";
import { Badge, ErrorBanner, PageHead, Progress, btn, btn2, fmt, input, td } from "@/components/ui";

export const dynamic = "force-dynamic";
const PRI: Record<number, [string, string]> = { 1: ["High", "bg-red-100 text-red-800"], 2: ["Normal", "bg-slate-100 text-slate-700"], 3: ["Low", "bg-sky-100 text-sky-800"] };

export default async function Orders({ searchParams }: { searchParams: Promise<{ error?: string; status?: string; q?: string; line?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1), size = 20;
  const where = {
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.line ? { lineId: Number(sp.line) } : {}),
    ...(q ? { OR: [{ no: { contains: q } }, { remark: { contains: q } }, { bom: { product: { name: { contains: q } } } }, { bom: { product: { code: { contains: q } } } }] } : {}),
  };
  const [total, orders, lines] = await Promise.all([
    db.productionOrder.count({ where }),
    db.productionOrder.findMany({ where, orderBy: [{ id: "desc" }], skip: (page - 1) * size, take: size, include: { bom: { include: { product: true } }, line: true } }),
    db.productionLine.findMany(),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: Record<string, string>) => { const u = new URLSearchParams({ ...(sp as Record<string, string>), ...p }); u.delete("error"); return `/orders?${u}`; };
  const now = new Date();

  return (
    <div>
      <PageHead title="Production orders" sub={`${total} orders`} icon={ClipboardList}><Link href="/orders/new" className={btn}><Plus size={15} /> New order</Link></PageHead>
      <ErrorBanner error={sp.error} />
      <form className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-white p-3 shadow-sm">
        <div className="relative"><Search size={15} className="absolute left-2.5 top-2.5 text-muted" /><input name="q" defaultValue={q} placeholder="Search no., product, remark…" className={`${input} w-72 pl-8`} /></div>
        <select name="status" defaultValue={sp.status ?? ""} className={input}><option value="">Status: all</option>{["DRAFT", "RELEASED", "SUSPENDED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="line" defaultValue={sp.line ?? ""} className={input}><option value="">Line: all</option>{lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <button className={btn2}>Apply</button>
        {(q || sp.status || sp.line) && <Link href="/orders" className="text-sm text-brand hover:underline">Clear</Link>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-left text-[11px] uppercase tracking-wider text-blue-100">
            <tr>{["Order", "Product", "Line", "Priority", "Progress", "Planned cost", "Actual cost", "Due", "Status"].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-steel-100 [&>tr:hover]:bg-blue-50/40">
            {orders.map((o) => {
              const pl = plannedTotal(o), ac = actualTotal(o);
              const late = o.status === "RELEASED" && o.plannedEnd && o.plannedEnd < now;
              return (
                <tr key={o.id}>
                  <td className={td}><Link href={`/orders/${o.id}`} className="font-mono font-medium text-brand hover:underline">{o.no}</Link></td>
                  <td className={td}><div>{o.bom.product.name}</div><div className="text-xs text-muted">{o.bom.name}</div></td>
                  <td className={td}>{o.line?.name ?? "—"}</td>
                  <td className={td}><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRI[o.priority][1]}`}>{PRI[o.priority][0]}</span></td>
                  <td className={`${td} w-40`}><div className="mb-1 text-xs text-muted">{fmt(o.producedQty, 0)} / {fmt(o.plannedQty, 0)}</div><Progress value={o.producedQty} max={o.plannedQty} /></td>
                  <td className={`${td} tabular-nums`}>{fmt(pl, 0)}</td>
                  <td className={`${td} tabular-nums ${ac > pl && pl > 0 ? "font-semibold text-red-600" : ""}`}>{fmt(ac, 0)}</td>
                  <td className={`${td} ${late ? "font-semibold text-red-600" : ""}`}>{o.plannedEnd?.toLocaleDateString() ?? "—"}{late && " ⚠"}</td>
                  <td className={td}><Badge s={o.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!orders.length && <div className="p-10 text-center text-sm text-muted">No orders match.</div>}
        <div className="flex items-center justify-between border-t border-steel-100 px-3 py-2 text-xs text-muted">
          <span>{total ? `Showing ${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}` : "0 orders"}</span>
          <div className="flex items-center gap-1">{page > 1 && <Link href={href({ page: String(page - 1) })} className={`${btn2} !py-1`}>‹ Prev</Link>}<span className="px-2">Page {page} / {pages}</span>{page < pages && <Link href={href({ page: String(page + 1) })} className={`${btn2} !py-1`}>Next ›</Link>}</div>
        </div>
      </div>
    </div>
  );
}
