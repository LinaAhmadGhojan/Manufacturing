import Link from "next/link";
import {
  ClipboardList, Factory, Inbox, ShieldCheck, PauseCircle, Wrench, AlertTriangle, PackageX, LayoutDashboard, Clock, HardHat, CheckCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { actualTotal, plannedTotal } from "@/lib/exec";
import { Badge, Bars, Card, Donut, Empty, Kpi, PageHead, Progress, fmt } from "@/components/ui";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  DRAFT: "#94a3b8", RELEASED: "#1d6fe0", SUSPENDED: "#f59e0b", CLOSED: "#334155",
  PENDING: "#cbd5e1", IN_PROGRESS: "#2f86f0", DONE: "#10b981", QC_PENDING: "#8b5cf6", VERIFY: "#6366f1", HOLDING: "#f59e0b", SCRAP: "#ef4444", DELIVERED: "#14b8a6", LOCKED: "#64748b",
};

export default async function Dashboard() {
  const settings = await getSettings();
  const hoursPerDay = Number(settings.workingHoursPerDay) || 7;
  const nearDays = Number(settings.nearDeliveryDays) || 7;
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);

  const [orders, requests, unitsByStatus, openRepairs, lines, products, activeMats, stepsRunning, timeToday, qcQueue] = await Promise.all([
    db.productionOrder.findMany({ include: { bom: { include: { product: true } }, line: true, units: { select: { status: true } } } }),
    db.productionRequest.count({ where: { status: "NEW" } }),
    db.productionUnit.groupBy({ by: ["status"], _count: true, where: { order: { status: { in: ["RELEASED", "SUSPENDED"] } } } }),
    db.repairLog.count({ where: { status: { not: "APPROVED" } } }),
    db.productionLine.findMany({ where: { active: true } }),
    db.product.findMany({ where: { kind: "RAW" } }),
    db.poMaterial.findMany({ where: { order: { status: { in: ["RELEASED", "SUSPENDED"] } } } }),
    db.productionStep.findMany({ where: { status: "IN_PROGRESS" }, include: { bomOp: { include: { operation: true } }, unit: { include: { order: true } } }, orderBy: { startedAt: "asc" }, take: 6 }),
    db.timeEntry.groupBy({ by: ["memberId"], _sum: { minutes: true }, where: { at: { gte: startOfDay } } }),
    db.productionStep.count({ where: { status: "QC_PENDING" } }),
  ]);
  const members = await db.teamMember.findMany();

  const active = orders.filter((o) => o.status === "RELEASED");
  const byStatus = (s: string) => orders.filter((o) => o.status === s).length;
  const holding = unitsByStatus.find((u) => u.status === "HOLDING")?._count ?? 0;

  // Raw material on hand vs outstanding commitment
  const commit = new Map<number, number>();
  for (const m of activeMats) commit.set(m.productId, (commit.get(m.productId) ?? 0) + Math.max(0, m.plannedQty - m.usedQty));
  const matRows = products.filter((p) => commit.has(p.id)).map((p) => ({ p, need: commit.get(p.id)!, have: p.qtyOnHand })).sort((a, b) => b.need / Math.max(b.have, 1e-4) - a.need / Math.max(a.have, 1e-4));
  const short = matRows.filter((r) => r.have < r.need);

  // Line load: outstanding units vs capacity
  const lineLoad = lines.map((l) => {
    const left = active.filter((o) => o.lineId === l.id).reduce((s, o) => s + Math.max(0, o.plannedQty - o.producedQty), 0);
    return { l, left, days: l.capacity > 0 ? left / l.capacity : 0 };
  });

  const overdue = active.filter((o) => o.plannedEnd && o.plannedEnd < now);
  const near = active.filter((o) => o.plannedEnd && o.plannedEnd >= now && o.plannedEnd.getTime() - now.getTime() <= nearDays * 864e5);
  const waitingClose = active.filter((o) => o.units.length && o.units.every((u) => ["DELIVERED", "SCRAP", "LOCKED"].includes(u.status) || (o.producedQty >= o.plannedQty)));
  const cost = orders.filter((o) => actualTotal(o) > 0 && o.status !== "DRAFT").slice(0, 6);

  return (
    <div>
      <PageHead title="Production dashboard" sub={`Live plant overview · ${hoursPerDay} h shift`} icon={LayoutDashboard}>
        <Link href="/orders" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700">+ New order</Link>
      </PageHead>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Running orders" value={active.length} icon={ClipboardList} hint={`${byStatus("DRAFT")} drafts`} href="/orders" />
        <Kpi label="New requests" value={requests} icon={Inbox} hint="awaiting acceptance" href="/requests" warn={requests > 0} />
        <Kpi label="Waiting QC" value={qcQueue} icon={ShieldCheck} hint="operations to inspect" href="/qc" warn={qcQueue > 0} />
        <Kpi label="Suspended" value={byStatus("SUSPENDED")} icon={PauseCircle} hint="orders on hold" href="/orders" />
        <Kpi label="Holding area" value={holding} icon={AlertTriangle} hint="units held by QC" href="/supervisor" warn={holding > 0} />
        <Kpi label="Open repairs" value={openRepairs} icon={Wrench} hint="repair logs" href="/supervisor" />
        <Kpi label="Short materials" value={short.length} icon={PackageX} hint="below commitment" href="/reports/shortage" warn={short.length > 0} />
        <Kpi label="Ready to close" value={waitingClose.length} icon={CheckCheck} hint="orders fully received" href="/orders" />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card title="Orders by status" icon={ClipboardList}>
          <Donut data={(["DRAFT", "RELEASED", "SUSPENDED", "CLOSED"] as const).map((s) => [s, byStatus(s), COLORS[s]])} />
        </Card>
        <Card title="Unit progress (live orders)" icon={HardHat}>
          <Donut data={unitsByStatus.map((u) => [u.status.replace("_", " "), u._count, COLORS[u.status] ?? "#94a3b8"])} />
          {!unitsByStatus.length && <Empty>No units in production</Empty>}
        </Card>
        <Card title="Production line load" icon={Factory} right={<span className="text-xs text-muted">outstanding vs capacity</span>}>
          <ul className="space-y-3">
            {lineLoad.map(({ l, left, days }) => (
              <li key={l.id}>
                <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{l.name}</span><span className="text-muted">{fmt(left, 0)} units · {fmt(days, 1)} days</span></div>
                <Progress value={left} max={Math.max(l.capacity * 5, left, 1)} danger={days > 5} />
              </li>
            ))}
            {!lines.length && <Empty>No lines</Empty>}
          </ul>
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card title="Raw materials: on hand vs committed" icon={PackageX}>
          <Bars data={matRows.slice(0, 8).map((r) => [r.p.name, r.need, Math.max(r.have, 0.0001)] as [string, number, number])} />
          <p className="mt-2 text-xs text-muted">Bar = committed qty over available; red means a shortage.</p>
        </Card>
        <Card title="Delivery watch" icon={Clock}>
          <ul className="divide-y divide-steel-100 text-sm">
            {[...overdue.map((o) => ({ o, tag: "OVERDUE" })), ...near.map((o) => ({ o, tag: "DUE SOON" }))].slice(0, 8).map(({ o, tag }) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <Link href={`/orders/${o.id}`} className="font-mono text-brand hover:underline">{o.no}</Link>
                <span>{o.bom.product.name}</span>
                <span className="text-xs text-muted">{o.plannedEnd?.toLocaleDateString()}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tag === "OVERDUE" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{tag}</span>
              </li>
            ))}
            {!overdue.length && !near.length && <Empty>Nothing overdue or near delivery</Empty>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Operations in progress (oldest first)" icon={HardHat}>
          <ul className="divide-y divide-steel-100 text-sm">
            {stepsRunning.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span>{s.bomOp.operation.name}</span>
                <span className="font-mono text-xs text-muted">{s.unit.serial}</span>
                <span className="text-xs text-muted">{s.startedAt ? `${Math.round((now.getTime() - s.startedAt.getTime()) / 6e4)} min` : ""}</span>
              </li>
            ))}
            {!stepsRunning.length && <Empty>Shop floor is idle</Empty>}
          </ul>
        </Card>
        <Card title="Technicians — minutes today" icon={Wrench}>
          <Bars data={timeToday.map((t) => [members.find((m) => m.id === t.memberId)?.name ?? "?", t._sum.minutes ?? 0] as [string, number])} unit="min" />
        </Card>
        <Card title="Cost vs plan" icon={ClipboardList}>
          <ul className="space-y-3 text-sm">
            {cost.map((o) => {
              const planned = plannedTotal(o);
              const actual = actualTotal(o);
              return (
                <li key={o.id}>
                  <div className="mb-1 flex justify-between text-xs"><span className="font-mono">{o.no}</span><span className="text-muted">{fmt(actual, 0)} / {fmt(planned, 0)} <Badge s={o.status} /></span></div>
                  <Progress value={actual} max={planned} danger={actual > planned} />
                </li>
              );
            })}
            {!cost.length && <Empty>No cost recorded yet</Empty>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
