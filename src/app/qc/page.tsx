import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, ErrorBanner, PageHead, Table, btn, btnDanger, input, td } from "@/components/ui";
import { qcAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function QcPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [queue, history] = await Promise.all([
    db.productionStep.findMany({
      where: { status: "QC_PENDING" },
      include: { unit: { include: { order: true } }, bomOp: { include: { operation: true, qcTemplate: { include: { points: true } } } } },
      orderBy: { id: "asc" },
    }),
    db.qcCheck.findMany({ orderBy: { id: "desc" }, take: 15, include: { unit: true } }),
  ]);
  return (
    <div>
      <PageHead title="Quality control" sub="Inspect operations that require a QC pass before the unit can continue" icon={ShieldCheck} />
      <ErrorBanner error={error} />
      <div className="mb-6 space-y-3">
        {queue.map((s) => (
          <Card key={s.id} title={`${s.bomOp.operation.name} · ${s.unit.serial}`} right={<span className="font-mono text-xs text-muted">{s.unit.order.no}</span>}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted">{s.bomOp.qcTemplate?.name ?? "Check points"}</div>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {s.bomOp.qcTemplate?.points.map((p) => <li key={p.id}>{p.label}{p.essential && <b className="text-red-600"> *</b>}</li>)}
                </ul>
              </div>
              <form action={qcAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="stepId" value={s.id} />
                <input name="remark" placeholder="Remark" className={`${input} min-w-0 flex-1`} />
                <select name="failAction" className={input} title="Action if failed">
                  <option value="RETURN_TO_TECH">on fail → return to technician</option>
                  <option value="HOLD">on fail → holding area</option>
                  <option value="SCRAP">on fail → scrap</option>
                </select>
                <button name="result" value="PASS" className={btn}>Pass</button>
                <button name="result" value="FAIL" className={btnDanger}>Fail</button>
              </form>
            </div>
          </Card>
        ))}
        {!queue.length && <Card><p className="py-6 text-center text-sm text-muted">Nothing waiting for inspection.</p></Card>}
      </div>
      <h2 className="mb-2 text-sm font-semibold text-navy-800">Recent inspections</h2>
      <Table head={["When", "Serial", "Result", "On fail", "Remark"]} empty={history.length ? undefined : "No inspections yet"}>
        {history.map((h) => (
          <tr key={h.id}>
            <td className={td}>{h.at.toLocaleString()}</td><td className={`${td} font-mono text-xs`}>{h.unit.serial}</td>
            <td className={td}><Badge s={h.result === "PASS" ? "DONE" : "SCRAP"} /> {h.result}</td><td className={td}>{h.failAction ?? ""}</td><td className={td}>{h.remark ?? ""}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
