import { UserCog } from "lucide-react";
import { db } from "@/lib/db";
import { Badge, Card, ErrorBanner, Field, PageHead, Table, btn, btn2, input, td } from "@/components/ui";
import { verifyStepAction } from "../shop-floor/actions";
import { approveRepairAction, createRepairAction, releaseHoldingAction, submitRepairAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Supervisor({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [verify, holding, repairs, units] = await Promise.all([
    db.productionStep.findMany({ where: { status: "VERIFY" }, include: { unit: { include: { order: true } }, bomOp: { include: { operation: true } }, time: { include: { member: true } } } }),
    db.productionUnit.findMany({ where: { status: "HOLDING" }, include: { order: true } }),
    db.repairLog.findMany({ orderBy: { id: "desc" }, include: { unit: true, order: true } }),
    db.productionUnit.findMany({ where: { order: { status: "RELEASED" }, status: { notIn: ["DELIVERED"] } }, take: 100, orderBy: { id: "desc" } }),
  ]);
  return (
    <div>
      <PageHead title="Supervisor" sub="Verify operations, manage the holding area and repair logs" icon={UserCog} />
      <ErrorBanner error={error} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Awaiting verification (${verify.length})`}>
          <ul className="divide-y divide-steel-100 text-sm">
            {verify.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{s.bomOp.operation.name} <span className="font-mono text-xs text-muted">{s.unit.serial}</span></div>
                  <div className="text-xs text-muted">{[...new Set(s.time.map((t) => t.member.name))].join(", ") || "no time logged"}</div>
                </div>
                <form action={verifyStepAction}><input type="hidden" name="stepId" value={s.id} /><button className={btn}>Verify</button></form>
              </li>
            ))}
            {!verify.length && <li className="py-4 text-center text-muted">Nothing to verify</li>}
          </ul>
        </Card>

        <Card title={`Holding area (${holding.length})`}>
          <ul className="divide-y divide-steel-100 text-sm">
            {holding.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2">
                <span><span className="font-mono text-xs">{u.serial}</span> <span className="text-muted">· {u.order.no}</span></span>
                <form action={releaseHoldingAction}><input type="hidden" name="unitId" value={u.id} /><button className={btn2}>Return to production</button></form>
              </li>
            ))}
            {!holding.length && <li className="py-4 text-center text-muted">No held units</li>}
          </ul>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-navy-800">Repair log</h2>
      <Card className="mb-3">
        <form action={createRepairAction} className="flex flex-wrap items-end gap-3">
          <Field label="Unit"><select name="unitId" className={`${input} w-52`}>{units.map((u) => <option key={u.id} value={u.id}>{u.serial} ({u.status})</option>)}</select></Field>
          <Field label="Issue"><input name="issue" className={`${input} w-80`} required /></Field>
          <button className={btn}>Report issue</button>
        </form>
      </Card>
      <Table head={["Reported", "Serial", "Issue", "Fix", "Status", ""]} empty={repairs.length ? undefined : "No repair logs"}>
        {repairs.map((r) => (
          <tr key={r.id}>
            <td className={td}>{r.reportedAt.toLocaleDateString()}</td>
            <td className={`${td} font-mono text-xs`}>{r.unit.serial}</td>
            <td className={td}>{r.issue}</td>
            <td className={td}>
              {r.status === "OPEN" ? (
                <form action={submitRepairAction} className="flex gap-1.5">
                  <input type="hidden" name="id" value={r.id} /><input name="fix" placeholder="What was done" className={`${input} w-56`} />
                  <button className={btn2}>Submit</button>
                </form>
              ) : r.fix}
            </td>
            <td className={td}><Badge s={r.status} /></td>
            <td className={td}>{r.status === "SUBMITTED" && <form action={approveRepairAction}><input type="hidden" name="id" value={r.id} /><button className={btn}>Approve</button></form>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
