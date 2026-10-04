import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Badge, Bars, Card, PageHead, Table, fmt, td } from "@/components/ui";

export const dynamic = "force-dynamic";

const TITLES: Record<string, [string, string]> = {
  planning: ["Production planning", "Outstanding work per line and estimated finish by capacity"],
  materials: ["Material utilization", "Planned vs consumed raw material across orders"],
  shortage: ["Material shortage", "Committed requirements that stock cannot cover"],
  cost: ["Cost analysis", "Planned vs actual cost and resulting unit cost per order"],
  manpower: ["Manpower", "Logged time and labour cost per employee"],
  batches: ["Batches & expiry", "Raw-material and finished-goods lots with expiry status and remaining quantity"],
  serials: ["Serial status", "Every serial with its current stage — filter by order or status"],
};

const Var = ({ v }: { v: number }) => <span className={v > 0.005 ? "font-semibold text-red-600" : v < -0.005 ? "text-emerald-600" : ""}>{v > 0 ? "+" : ""}{fmt(v)}</span>;

export default async function Report({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<{ order?: string; status?: string }> }) {
  const { name } = await params;
  const sp = await searchParams;
  if (!TITLES[name]) notFound();
  const [title, sub] = TITLES[name];
  const s = await getSettings();
  const perWeek = Number(s.workingDaysPerWeek) || 6;

  let body: React.ReactNode = null;

  if (name === "planning") {
    const lines = await db.productionLine.findMany({ include: { orders: { where: { status: { in: ["RELEASED", "SUSPENDED"] } }, include: { bom: { include: { product: true } } } } } });
    body = (
      <div className="space-y-5">
        {lines.map((l) => {
          const left = l.orders.reduce((a, o) => a + Math.max(0, o.plannedQty - o.producedQty), 0);
          const days = l.capacity > 0 ? left / l.capacity : 0;
          const calendar = Math.ceil((days / perWeek) * 7);
          const finish = new Date(Date.now() + calendar * 864e5);
          return (
            <Card key={l.id} title={`${l.name} — capacity ${fmt(l.capacity, 0)}/day`} right={<span className="text-sm text-muted">{fmt(left, 0)} units · {fmt(days, 1)} working days{left ? ` · est. finish ${finish.toLocaleDateString()}` : ""}</span>}>
              <Table head={["Order", "Product", "Remaining", "Planned end", "Status"]} empty={l.orders.length ? undefined : "Idle"}>
                {l.orders.map((o) => (
                  <tr key={o.id}><td className={`${td} font-mono`}>{o.no}</td><td className={td}>{o.bom.product.name}</td><td className={td}>{fmt(o.plannedQty - o.producedQty, 0)}</td><td className={td}>{o.plannedEnd?.toLocaleDateString() ?? "—"}</td><td className={td}><Badge s={o.status} /></td></tr>
                ))}
              </Table>
            </Card>
          );
        })}
      </div>
    );
  }

  if (name === "materials") {
    const mats = await db.poMaterial.groupBy({ by: ["productId"], _sum: { plannedQty: true, usedQty: true } });
    const prods = await db.product.findMany({ where: { id: { in: mats.map((m) => m.productId) } } });
    body = (
      <>
        <Card className="mb-5"><Bars data={mats.map((m) => [prods.find((p) => p.id === m.productId)?.name ?? "?", m._sum.usedQty ?? 0, Math.max(m._sum.plannedQty ?? 0, 0.0001)] as [string, number, number])} /></Card>
        <Table head={["Material", "Planned", "Consumed", "Variance", "Cost of consumed"]}>
          {mats.map((m) => {
            const p = prods.find((x) => x.id === m.productId)!;
            const pl = m._sum.plannedQty ?? 0, us = m._sum.usedQty ?? 0;
            return <tr key={m.productId}><td className={td}>{p.name}</td><td className={td}>{fmt(pl)} {p.uom}</td><td className={td}>{fmt(us)}</td><td className={td}><Var v={us - pl} /></td><td className={td}>{fmt(us * p.avgCost)}</td></tr>;
          })}
        </Table>
      </>
    );
  }

  if (name === "shortage") {
    const mats = await db.poMaterial.findMany({ where: { order: { status: { in: ["RELEASED", "SUSPENDED"] } } }, include: { product: true, order: true } });
    const agg = new Map<number, { p: (typeof mats)[number]["product"]; need: number; orders: Set<string> }>();
    for (const m of mats) {
      const left = Math.max(0, m.plannedQty - m.usedQty);
      if (!left) continue;
      const a = agg.get(m.productId) ?? { p: m.product, need: 0, orders: new Set<string>() };
      a.need += left; a.orders.add(m.order.no); agg.set(m.productId, a);
    }
    const rows = [...agg.values()].map((a) => ({ ...a, gap: a.need - a.p.qtyOnHand })).sort((x, y) => y.gap - x.gap);
    body = (
      <Table head={["Material", "Outstanding need", "On hand", "Shortage", "Est. purchase cost", "Orders"]} empty={rows.length ? undefined : "No active commitments"}>
        {rows.map((r) => (
          <tr key={r.p.id}>
            <td className={td}>{r.p.name}</td><td className={td}>{fmt(r.need)} {r.p.uom}</td><td className={td}>{fmt(r.p.qtyOnHand)}</td>
            <td className={td}>{r.gap > 0 ? <b className="text-red-600">{fmt(r.gap)}</b> : <span className="text-emerald-600">covered</span>}</td>
            <td className={td}>{r.gap > 0 ? fmt(r.gap * r.p.avgCost) : "—"}</td><td className={`${td} font-mono text-xs`}>{[...r.orders].join(", ")}</td>
          </tr>
        ))}
      </Table>
    );
  }

  if (name === "cost") {
    const orders = await db.productionOrder.findMany({ where: { status: { not: "DRAFT" } }, include: { bom: { include: { product: true } } }, orderBy: { id: "desc" } });
    body = (
      <Table head={["Order", "Product", "Produced", "Planned", "Material", "Labour+equip.", "Expenses", "Actual total", "Variance", "Unit cost"]} empty={orders.length ? undefined : "No released orders"}>
        {orders.map((o) => {
          const pl = o.plannedMaterialCost + o.plannedLaborCost + o.plannedExpenseCost, ac = o.actualMaterialCost + o.actualLaborCost + o.actualExpenseCost;
          return (
            <tr key={o.id}>
              <td className={`${td} font-mono`}>{o.no}</td><td className={td}>{o.bom.product.name}</td><td className={td}>{fmt(o.producedQty, 0)}/{fmt(o.plannedQty, 0)}</td>
              <td className={td}>{fmt(pl)}</td><td className={td}>{fmt(o.actualMaterialCost)}</td><td className={td}>{fmt(o.actualLaborCost)}</td><td className={td}>{fmt(o.actualExpenseCost)}</td><td className={td}>{fmt(ac)}</td>
              <td className={td}><Var v={ac - pl} /></td><td className={td}>{o.producedQty > 0 ? fmt(ac / o.producedQty) : "—"}</td>
            </tr>
          );
        })}
      </Table>
    );
  }

  if (name === "manpower") {
    const [grp, members] = await Promise.all([db.timeEntry.groupBy({ by: ["memberId"], _sum: { minutes: true, cost: true }, _count: true }), db.teamMember.findMany()]);
    body = (
      <>
        <Card className="mb-5"><Bars data={grp.map((g) => [members.find((m) => m.id === g.memberId)?.name ?? "?", (g._sum.minutes ?? 0) / 60] as [string, number])} unit="h" /></Card>
        <Table head={["Employee", "Entries", "Hours", "Rate", "Labour cost"]} empty={grp.length ? undefined : "No time logged"}>
          {grp.map((g) => {
            const m = members.find((x) => x.id === g.memberId);
            return <tr key={g.memberId}><td className={td}>{m?.name}</td><td className={td}>{g._count}</td><td className={td}>{fmt((g._sum.minutes ?? 0) / 60)}</td><td className={td}>{fmt(m?.hourRate)}</td><td className={td}>{fmt(g._sum.cost)}</td></tr>;
          })}
        </Table>
      </>
    );
  }

  if (name === "batches") {
    const bs = await db.batch.findMany({ include: { product: true }, orderBy: [{ expiryDate: "asc" }, { id: "asc" }] });
    const now = Date.now();
    const exp = bs.filter((b) => b.expiryDate && b.expiryDate.getTime() < now && b.qtyOnHand > 0);
    const soon = bs.filter((b) => b.expiryDate && b.expiryDate.getTime() >= now && b.expiryDate.getTime() - now < 60 * 864e5 && b.qtyOnHand > 0);
    body = (
      <>
        <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
          <Card><div className="text-xs text-muted">Expired with stock</div><div className="text-2xl font-semibold text-red-600">{exp.length}</div><div className="text-xs text-muted">value {fmt(exp.reduce((a, b) => a + b.qtyOnHand * b.unitCost, 0), 0)}</div></Card>
          <Card><div className="text-xs text-muted">Expiring within 60 days</div><div className="text-2xl font-semibold text-amber-600">{soon.length}</div><div className="text-xs text-muted">value {fmt(soon.reduce((a, b) => a + b.qtyOnHand * b.unitCost, 0), 0)}</div></Card>
          <Card><div className="text-xs text-muted">Batches tracked</div><div className="text-2xl font-semibold text-navy-800">{bs.length}</div></Card>
        </div>
        <Table head={["Batch", "Item", "Received", "Expiry", "Days left", "Qty in", "On hand", "Value", "Source"]} empty={bs.length ? undefined : "No batches"}>
          {bs.map((b) => {
            const days = b.expiryDate ? Math.round((b.expiryDate.getTime() - now) / 864e5) : null;
            return (
              <tr key={b.id}><td className={`${td} font-mono text-xs`}>{b.code}</td><td className={td}>{b.product.name}</td><td className={td}>{b.receivedAt.toLocaleDateString()}</td><td className={td}>{b.expiryDate?.toLocaleDateString() ?? "—"}</td>
                <td className={td}>{days === null ? "—" : days < 0 ? <b className="text-red-600">expired {-days} d</b> : days < 60 ? <b className="text-amber-600">{days} d</b> : days}</td>
                <td className={td}>{fmt(b.qtyIn)}</td><td className={td}>{fmt(b.qtyOnHand)}</td><td className={td}>{fmt(b.qtyOnHand * b.unitCost)}</td><td className={td}>{b.orderId ? "Production lot" : "Purchase"}</td></tr>
            );
          })}
        </Table>
      </>
    );
  }

  if (name === "serials") {
    const orders = await db.productionOrder.findMany({ where: { status: { not: "DRAFT" } }, orderBy: { id: "desc" } });
    const units = await db.productionUnit.findMany({
      where: { ...(sp.order ? { orderId: Number(sp.order) } : {}), ...(sp.status ? { status: sp.status as never } : {}) },
      include: { order: { include: { bom: { include: { product: true } } } }, steps: { include: { bomOp: { include: { operation: true } } }, orderBy: { bomOp: { seq: "asc" } } } },
      orderBy: { id: "desc" }, take: 300,
    });
    const groups = await db.productionUnit.groupBy({ by: ["status"], _count: true, where: sp.order ? { orderId: Number(sp.order) } : undefined });
    body = (
      <>
        <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-white p-3 shadow-sm">
          <select name="order" defaultValue={sp.order ?? ""} className="rounded-md border border-steel-200 bg-white px-2.5 py-1.5 text-sm"><option value="">All orders</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.no}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border border-steel-200 bg-white px-2.5 py-1.5 text-sm"><option value="">All statuses</option>{["PENDING", "IN_PROGRESS", "QC_PENDING", "VERIFY", "HOLDING", "DONE", "DELIVERED", "SCRAP", "LOCKED"].map((s) => <option key={s}>{s}</option>)}</select>
          <button className="rounded-md border border-steel-200 bg-white px-3 py-1.5 text-sm">Apply</button>
          <div className="ml-auto flex gap-2">{groups.map((g) => <span key={g.status} className="flex items-center gap-1 text-xs"><Badge s={g.status} /> {g._count}</span>)}</div>
        </form>
        <Table head={["Serial", "Product", "Order", "Status", "Current stage", "Progress"]} empty={units.length ? undefined : "No serials"}>
          {units.map((u) => {
            const done = u.steps.filter((s) => s.status === "DONE").length;
            const cur = u.steps.find((s) => s.status !== "DONE");
            return (
              <tr key={u.id}><td className={`${td} font-mono text-xs`}><a className="text-brand hover:underline" href={`/trace?q=${encodeURIComponent(u.serial)}`}>{u.serial}</a></td><td className={td}>{u.order.bom.product.name}</td><td className={`${td} font-mono text-xs`}>{u.order.no}</td><td className={td}><Badge s={u.status} /></td>
                <td className={td}>{cur ? <>{cur.bomOp.operation.name} <Badge s={cur.status} /></> : "All operations done"}</td><td className={td}>{done}/{u.steps.length}</td></tr>
            );
          })}
        </Table>
      </>
    );
  }

  return (
    <div>
      <PageHead title={title} sub={sub} icon={BarChart3} />
      {body}
    </div>
  );
}
