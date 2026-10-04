import Link from "next/link";
import { Warehouse, Tag, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, ErrorBanner, Field, PageHead, Table, Tabs, btn, btn2, fmt, input, td } from "@/components/ui";
import { ConfirmButton } from "@/components/Confirm";
import { adjustStockAction, deletePurchaseAction, newPurchaseAction, purchaseStatusAction, receiveStockAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Inventory({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string; q?: string; kind?: string; low?: string; purchase?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? "stock";
  const q = sp.q?.trim() ?? "";
  const now = new Date();
  const [products, suppliers] = await Promise.all([db.product.findMany({ where: { active: true }, orderBy: { code: "asc" }, include: { category: true } }), db.supplier.findMany({ where: { active: true } })]);
  const base = "/inventory";

  const stockRows = products.filter((p) => (!sp.kind || p.kind === sp.kind) && (!q || `${p.code} ${p.name}`.toLowerCase().includes(q.toLowerCase())) && (sp.low !== "1" || p.qtyOnHand < p.minStock));
  const stockValue = products.reduce((s, p) => s + p.qtyOnHand * p.avgCost, 0);
  const lowCount = products.filter((p) => p.qtyOnHand < p.minStock).length;

  const batches = tab === "batches" || tab === "adjust" ? await db.batch.findMany({ include: { product: true }, orderBy: [{ expiryDate: "asc" }], where: q ? { OR: [{ code: { contains: q } }, { product: { name: { contains: q } } }] } : undefined }) : [];
  const moves = tab === "moves" ? await db.stockMove.findMany({ include: { product: true, batch: true, order: true }, orderBy: { id: "desc" }, take: 150, where: q ? { OR: [{ product: { name: { contains: q } } }, { product: { code: { contains: q } } }] } : undefined }) : [];
  const purchases = tab === "purchases" ? await db.purchaseRequest.findMany({ include: { product: true, supplier: true, order: true }, orderBy: { id: "desc" } }) : [];
  const pending = purchases.find((p) => String(p.id) === sp.purchase);

  return (
    <div>
      <PageHead title="Inventory" sub={`${products.length} items · stock value ${fmt(stockValue, 0)} · ${lowCount} below minimum`} icon={Warehouse} />
      <ErrorBanner error={sp.error} />
      <Tabs base={base} current={tab} tabs={[["stock", "Stock"], ["batches", "Batches & expiry"], ["moves", "Movements"], ["purchases", "Purchase requests"], ["receive", "Receive stock"], ["adjust", "Adjust"]]} />

      {(tab === "stock" || tab === "batches" || tab === "moves") && (
        <form className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-white p-3 shadow-sm">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="Search code / name / batch…" className={`${input} w-64`} />
          {tab === "stock" && <>
            <select name="kind" defaultValue={sp.kind ?? ""} className={input}><option value="">Kind: all</option><option>RAW</option><option>SEMI</option><option>FINISHED</option></select>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} className="accent-blue-600" /> Below minimum only</label>
          </>}
          <button className={btn2}>Apply</button>
        </form>
      )}

      {tab === "stock" && (
        <Table head={["Code", "Item", "Category", "Kind", "On hand", "Min", "Reorder", "Avg cost", "Value", "Tracking", ""]} empty={stockRows.length ? undefined : "No items"}>
          {stockRows.map((p) => {
            const low = p.qtyOnHand < p.minStock;
            return (
              <tr key={p.id}>
                <td className={`${td} font-mono text-xs`}>{p.code}</td><td className={td}>{p.name}</td><td className={td}>{p.category?.name ?? "—"}</td><td className={td}><Badge s={p.kind === "FINISHED" ? "DELIVERED" : p.kind === "RAW" ? "NEW" : "PENDING"} /></td>
                <td className={`${td} tabular-nums ${low ? "font-semibold text-red-600" : ""}`}>{fmt(p.qtyOnHand)} {p.uom}</td><td className={`${td} tabular-nums`}>{fmt(p.minStock)}</td><td className={`${td} tabular-nums`}>{fmt(p.reorderQty)}</td>
                <td className={`${td} tabular-nums`}>{fmt(p.avgCost)}</td><td className={`${td} tabular-nums`}>{fmt(p.avgCost * p.qtyOnHand, 0)}</td>
                <td className={td}><div className="flex gap-1">{p.serialBase && <span className="rounded bg-blue-50 px-1.5 text-[11px] font-medium text-brand">Serial</span>}{p.requireBatch && <span className="rounded bg-blue-50 px-1.5 text-[11px] font-medium text-brand">Batch</span>}</div></td>
                <td className={`${td} whitespace-nowrap`}>{low && p.kind === "RAW" && <form action={newPurchaseAction} className="inline"><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="qty" value={p.reorderQty || p.minStock} /><input type="hidden" name="remark" value="Below minimum stock" /><button className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">Reorder {fmt(p.reorderQty || p.minStock, 0)}</button></form>}</td>
              </tr>
            );
          })}
        </Table>
      )}

      {tab === "batches" && (
        <Table head={["Batch", "Item", "Received", "Expiry", "Qty in", "On hand", "Unit cost", "Source", ""]} empty={batches.length ? undefined : "No batches"}>
          {batches.map((b) => {
            const expired = b.expiryDate && b.expiryDate < now;
            const soon = b.expiryDate && !expired && b.expiryDate.getTime() - now.getTime() < 60 * 864e5;
            return (
              <tr key={b.id}>
                <td className={`${td} font-mono text-xs`}><Link className="text-brand hover:underline" href={`/trace?q=${encodeURIComponent(b.code)}`}>{b.code}</Link></td><td className={td}>{b.product.name}</td><td className={td}>{b.receivedAt.toLocaleDateString()}</td>
                <td className={`${td} ${expired ? "font-semibold text-red-600" : soon ? "font-semibold text-amber-600" : ""}`}>{b.expiryDate?.toLocaleDateString() ?? "—"}{expired && " · expired"}{soon && " · <60 d"}</td>
                <td className={`${td} tabular-nums`}>{fmt(b.qtyIn)}</td><td className={`${td} tabular-nums`}>{fmt(b.qtyOnHand)}</td><td className={`${td} tabular-nums`}>{fmt(b.unitCost)}</td><td className={td}>{b.orderId ? "Production lot" : "Purchase"}</td>
                <td className={td}><Link href={`/labels/batch/${b.id}`} className={`${btn2} !py-0.5`}><Tag size={13} /> Label</Link></td>
              </tr>
            );
          })}
        </Table>
      )}

      {tab === "moves" && (
        <Table head={["When", "Type", "Item", "Batch", "Qty", "Unit cost", "Order", "Note"]} empty={moves.length ? undefined : "No movements"}>
          {moves.map((m) => (
            <tr key={m.id}><td className={td}>{m.at.toLocaleString()}</td><td className={td}><Badge s={m.type === "RECEIVE" ? "DELIVERED" : m.type === "CONSUME" ? "IN_PROGRESS" : m.type === "PURCHASE" ? "ACCEPTED" : m.type === "COMMIT" ? "NEW" : "PENDING"} /> <span className="text-xs">{m.type}</span></td>
              <td className={td}>{m.product.name}</td><td className={`${td} font-mono text-xs`}>{m.batch?.code ?? ""}</td><td className={`${td} tabular-nums ${m.qty < 0 ? "text-red-600" : ""}`}>{fmt(m.qty)}</td><td className={`${td} tabular-nums`}>{fmt(m.unitCost)}</td>
              <td className={`${td} font-mono text-xs`}>{m.order ? <Link className="text-brand hover:underline" href={`/orders/${m.order.id}`}>{m.order.no}</Link> : ""}</td><td className={td}>{m.note ?? ""}</td></tr>
          ))}
        </Table>
      )}

      {tab === "purchases" && (
        <div className="space-y-5">
          <Card title="New purchase request">
            <form action={newPurchaseAction} className="flex flex-wrap items-end gap-3">
              <Field label="Item"><select name="productId" className={`${input} w-72`}>{products.filter((p) => p.kind !== "FINISHED").map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}</select></Field>
              <Field label="Qty"><input name="qty" type="number" min="0" step="any" className={`${input} w-28`} required /></Field>
              <Field label="Supplier"><select name="supplierId" className={input}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Remark"><input name="remark" className={`${input} w-56`} /></Field>
              <button className={btn}>Create</button>
            </form>
          </Card>
          <Table head={["No", "Item", "Qty", "Supplier", "From order", "Created", "Status", ""]} empty={purchases.length ? undefined : "No purchase requests"}>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className={`${td} font-mono text-xs`}>{p.no}</td><td className={td}>{p.product.name}</td><td className={`${td} tabular-nums`}>{fmt(p.qty)} {p.product.uom}</td><td className={td}>{p.supplier?.name ?? "—"}</td>
                <td className={`${td} font-mono text-xs`}>{p.order?.no ?? ""}</td><td className={td}>{p.createdAt.toLocaleDateString()}</td><td className={td}><Badge s={p.status === "RECEIVED" ? "DONE" : p.status === "CANCELLED" ? "SCRAP" : p.status === "ORDERED" ? "IN_PROGRESS" : "NEW"} /> <span className="text-xs">{p.status}</span></td>
                <td className={`${td} whitespace-nowrap`}>
                  <div className="flex gap-1">
                    {p.status === "OPEN" && <form action={purchaseStatusAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value="ORDERED" /><button className={`${btn2} !py-1`}>Mark ordered</button></form>}
                    {(p.status === "OPEN" || p.status === "ORDERED") && <Link href={`/inventory?tab=receive&purchase=${p.id}`} className={`${btn} !py-1`}>Receive</Link>}
                    {p.status !== "RECEIVED" && <form action={deletePurchaseAction}><input type="hidden" name="id" value={p.id} /><ConfirmButton message="Delete this request?" className="rounded border border-red-200 p-1.5 text-red-700 hover:bg-red-50"><Trash2 size={13} /></ConfirmButton></form>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {tab === "receive" && (
        <ReceiveForm products={products} suppliers={suppliers} purchase={sp.purchase ? await db.purchaseRequest.findUnique({ where: { id: Number(sp.purchase) } }) : null} />
      )}

      {tab === "adjust" && (
        <Card title="Stock adjustment (count difference, damage…)">
          <form action={adjustStockAction} className="flex flex-wrap items-end gap-3">
            <Field label="Item"><select name="productId" className={`${input} w-72`}>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmt(p.qtyOnHand)} {p.uom}</option>)}</select></Field>
            <Field label="Batch (if tracked)"><select name="batchId" className={`${input} w-64`}><option value="">—</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.product.code} · {b.code} · {fmt(b.qtyOnHand)}</option>)}</select></Field>
            <Field label="Change (+/−)"><input name="delta" type="number" step="any" className={`${input} w-28`} required /></Field>
            <Field label="Reason *"><input name="note" list="adj-reasons" className={`${input} w-64`} required /></Field>
            <datalist id="adj-reasons"><option>Stock count difference</option><option>Damaged in handling</option><option>Expired — written off</option></datalist>
            <button className={btn}>Post adjustment</button>
          </form>
        </Card>
      )}
      {pending && null}
    </div>
  );
}

function ReceiveForm({ products, suppliers, purchase }: { products: { id: number; code: string; name: string; uom: string; avgCost: number; requireBatch: boolean; kind: string }[]; suppliers: { id: number; name: string }[]; purchase: { id: number; productId: number; qty: number; supplierId: number | null } | null }) {
  return (
    <Card title={purchase ? "Receive against purchase request" : "Receive stock (purchase / opening balance)"}>
      <form action={receiveStockAction} className="grid gap-4 md:grid-cols-6">
        {purchase && <input type="hidden" name="purchaseId" value={purchase.id} />}
        <div className="md:col-span-3"><Field label="Item *"><select name="productId" defaultValue={purchase?.productId} className={input}>{products.filter((p) => p.kind !== "FINISHED").map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code}){p.requireBatch ? " · batch" : ""}</option>)}</select></Field></div>
        <div className="md:col-span-1"><Field label="Quantity *"><input name="qty" type="number" step="any" min="0" defaultValue={purchase?.qty} className={input} required /></Field></div>
        <div className="md:col-span-2"><Field label="Unit cost *"><input name="unitCost" type="number" step="any" min="0" className={input} required /></Field></div>
        <div className="md:col-span-2"><Field label="Batch / lot code"><input name="batchCode" className={input} placeholder="required for batch-tracked items" /></Field></div>
        <div className="md:col-span-2"><Field label="Expiry date"><input name="expiryDate" type="date" className={input} /></Field></div>
        <div className="md:col-span-2"><Field label="Supplier"><select name="supplierId" defaultValue={purchase?.supplierId ?? ""} className={input}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>
        <div className="md:col-span-3"><Field label="Supplier invoice / delivery ref"><input name="supplierRef" className={input} /></Field></div>
        <div className="md:col-span-3"><Field label="Note"><input name="note" className={input} /></Field></div>
        <div className="md:col-span-6"><button className={btn}>Receive into stock</button></div>
      </form>
    </Card>
  );
}
