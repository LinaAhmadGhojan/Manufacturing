import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const fmt = (n: number | null | undefined, d = 2) =>
  (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: d });

const tone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  RELEASED: "bg-blue-100 text-blue-800",
  SUSPENDED: "bg-amber-100 text-amber-800",
  CLOSED: "bg-slate-200 text-slate-600",
  NEW: "bg-sky-100 text-sky-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  PENDING: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-emerald-100 text-emerald-800",
  QC_PENDING: "bg-violet-100 text-violet-800",
  VERIFY: "bg-indigo-100 text-indigo-800",
  HOLDING: "bg-amber-100 text-amber-800",
  SCRAP: "bg-red-100 text-red-800",
  DELIVERED: "bg-teal-100 text-teal-800",
  LOCKED: "bg-slate-200 text-slate-600",
  OPEN: "bg-amber-100 text-amber-800",
  SUBMITTED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
};

export function Badge({ s, label }: { s: string; label?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone[s] ?? "bg-slate-100"}`}>{label ?? s.replace("_", " ")}</span>;
}

export function PageHead({ title, sub, icon: Icon, children }: { title: string; sub?: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-steel-200 pb-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-100 text-brand">
            <Icon size={22} />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export function Card({ title, icon: Icon, right, children, className = "" }: { title?: string; icon?: LucideIcon; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-steel-200 bg-white p-4 shadow-sm ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
            {Icon && <Icon size={16} className="text-brand" />}
            {title}
          </h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, icon: Icon, hint, href, warn }: { label: string; value: ReactNode; icon: LucideIcon; hint?: string; href?: string; warn?: boolean }) {
  const body = (
    <div className={`card-lift relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm ${warn ? "border-amber-300" : "border-steel-200"}`}>
      <div className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-navy-800">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-brand">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function ErrorBanner({ error }: { error?: string | string[] }) {
  if (!error) return null;
  return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-navy-900 text-left text-[11px] uppercase tracking-wider text-blue-100">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-steel-100 [&>tr:hover]:bg-blue-50/40">{children}</tbody>
      </table>
      {empty && <div className="p-8 text-center text-sm text-muted">{empty}</div>}
    </div>
  );
}

export const td = "px-3 py-2.5";
export const input = "rounded-md border border-steel-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-blue-200";
export const btn = "inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40";
export const btn2 = "inline-flex items-center gap-1.5 rounded-md border border-steel-200 bg-white px-3 py-1.5 text-sm text-navy-800 hover:bg-steel-50";
export const btnDanger = "inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export function Tabs({ base, current, tabs }: { base: string; current: string; tabs: [string, string][] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-steel-200">
      {tabs.map(([key, label]) => (
        <Link
          key={key}
          href={`${base}?tab=${key}`}
          className={`-mb-px border-b-2 px-3.5 py-2 text-sm ${current === key ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

export function Progress({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-steel-100">
      <div className={`h-2 rounded-full ${danger ? "bg-red-500" : "bg-gradient-to-r from-brand to-blue-400"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Donut chart from [label, value, color] slices. */
export function Donut({ data, size = 140 }: { data: [string, number, string][]; size?: number }) {
  const total = data.reduce((s, d) => s + d[1], 0);
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 140 140" className="shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e8eef7" strokeWidth="16" />
        {total > 0 &&
          data.map(([l, v, col]) => {
            const len = (v / total) * c;
            const el = <circle key={l} cx="70" cy="70" r={r} fill="none" stroke={col} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
            off += len;
            return el;
          })}
        <text x="70" y="70" textAnchor="middle" dominantBaseline="central" transform="rotate(90 70 70)" className="fill-navy-800 text-[26px] font-semibold">{total}</text>
      </svg>
      <ul className="space-y-1 text-sm">
        {data.map(([l, v, col]) => (
          <li key={l} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: col }} />
            <span className="text-muted">{l}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bar list: [label, value, max?] */
export function Bars({ data, unit = "" }: { data: [string, number, number?][]; unit?: string }) {
  const max = Math.max(...data.map((d) => d[2] ?? d[1]), 1);
  return (
    <ul className="space-y-2.5">
      {data.map(([l, v, m]) => (
        <li key={l}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-navy-800">{l}</span>
            <span className="tabular-nums text-muted">{fmt(v)}{m ? ` / ${fmt(m)}` : ""} {unit}</span>
          </div>
          <Progress value={v} max={m ?? max} danger={!!m && v > m} />
        </li>
      ))}
      {!data.length && <li className="text-sm text-muted">No data</li>}
    </ul>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="py-6 text-center text-sm text-muted">{children}</div>;
