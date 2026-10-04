import Link from "next/link";
import { Copy, Network, Plus, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, ErrorBanner, PageHead, btn, btn2, fmt, input, td } from "@/components/ui";
import { ConfirmButton } from "@/components/Confirm";
import { copyBom, deleteBom, toggleBomActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function Boms({ searchParams }: { searchParams: Promise<{ error?: string; q?: string; active?: string }> }) {
  const { error, q = "", active } = await searchParams;
  const boms = await db.bom.findMany({
    where: { ...(q ? { OR: [{ name: { contains: q } }, { product: { name: { contains: q } } }, { product: { code: { contains: q } } }, { model: { contains: q } }] } : {}), ...(active === "1" ? { active: true } : active === "0" ? { active: false } : {}) },
    orderBy: [{ productId: "asc" }, { id: "asc" }],
    include: { product: true, materials: { include: { product: true } }, operations: { include: { assets: { include: { asset: true } }, expenses: true } }, _count: { select: { orders: true } } },
  });
  return (
    <div>
      <PageHead title="Bills of materials" sub={`${boms.length} BOMs`} icon={Network}><Link href="/boms/new" className={btn}><Plus size={15} /> New BOM</Link></PageHead>
      <ErrorBanner error={error} />
      <form className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-white p-3 shadow-sm">
        <div className="relative"><Search size={15} className="absolute left-2.5 top-2.5 text-muted" /><input name="q" defaultValue={q} placeholder="Search BOM, product, model…" className={`${input} w-72 pl-8`} /></div>
        <select name="active" defaultValue={active ?? ""} className={input}><option value="">Active: any</option><option value="1">Active</option><option value="0">Inactive</option></select>
        <button className={btn2}>Apply</button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-left text-[11px] uppercase tracking-wider text-blue-100"><tr>{["BOM", "Product", "Model / gas / voltage", "Materials", "Operations", "Est. cost / unit", "Orders", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-steel-100 [&>tr:hover]:bg-blue-50/40">
            {boms.map((b) => {
              const k = 1 / b.outputQty;
              const mat = b.materials.reduce((s, m) => s + (m.qtyType === "RATIO" ? m.qty * k : m.qty / b.outputQty) * (1 + m.wastePct / 100) * m.product.avgCost, 0);
              const res = b.operations.reduce((s, o) => s + o.hours * o.costPerHour * (o.hoursType === "RATIO" ? k : 1 / b.outputQty) + o.assets.reduce((a, x) => a + x.hours * x.asset.hourRate * k, 0) + o.expenses.reduce((a, e) => a + e.amount * (e.amountType === "RATIO" ? k : 1 / b.outputQty), 0), 0);
              return (
                <tr key={b.id}>
                  <td className={td}><Link href={`/boms/${b.id}`} className="font-medium text-brand hover:underline">{b.name}</Link> {b.isDefault && <span className="ml-1 rounded bg-blue-50 px-1.5 text-[11px] font-medium text-brand">default</span>}</td>
                  <td className={td}>{b.product.name}<div className="font-mono text-[11px] text-muted">{b.product.code}</div></td>
                  <td className={`${td} text-xs`}>{[b.model, b.refrigerant, b.voltage].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={td}>{b.materials.length}</td><td className={td}>{b.operations.length}</td>
                  <td className={`${td} tabular-nums`}>{fmt(mat + res)}<div className="text-[11px] text-muted">mat {fmt(mat, 0)} · res {fmt(res, 0)}</div></td>
                  <td className={td}>{b._count.orders}</td>
                  <td className={td}><form action={toggleBomActive}><input type="hidden" name="id" value={b.id} /><button title="Toggle active"><Badge s={b.active ? "ACCEPTED" : "LOCKED"} /></button></form></td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div className="flex gap-1">
                      <form action={copyBom}><input type="hidden" name="id" value={b.id} /><button className={`${btn2} !px-2`} title="Copy"><Copy size={14} /></button></form>
                      {!b._count.orders && <form action={deleteBom}><input type="hidden" name="id" value={b.id} /><ConfirmButton message="Delete this BOM?" className="inline-flex items-center rounded-md border border-red-200 bg-white px-2 py-1.5 text-red-700 hover:bg-red-50"><Trash2 size={14} /></ConfirmButton></form>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!boms.length && <div className="p-10 text-center text-sm text-muted">No BOMs.</div>}
      </div>
    </div>
  );
}
