import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { ENTITIES, pick, type Col } from "@/lib/crud";
import { Badge, PageHead, btn, btn2, fmt, input, td } from "@/components/ui";
import { ConfirmButton } from "@/components/Confirm";
import { deleteRecord } from "../actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function Grid({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<SP> }) {
  const { entity } = await params;
  const e = ENTITIES[entity];
  if (!e) notFound();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const pageSize = [15, 25, 50, 100].includes(Number(sp.size)) ? Number(sp.size) : 25;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = sp.sort && e.columns.some((c) => c.key === sp.sort && !c.key.includes(".") && c.kind !== "tags") ? sp.sort : null;
  const dir = sp.dir === "desc" ? "desc" : "asc";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (q) where.OR = e.search.map((f) => ({ [f]: { contains: q } }));
  for (const f of e.filters ?? []) if (sp[f.field]) where[f.field] = sp[f.field];
  for (const f of e.boolFilters ?? []) if (sp[f.field] === "1") where[f.field] = true;
  else if (sp[f.field] === "0") where[f.field] = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (db as any)[e.model];
  const [total, rows]: [number, Record<string, unknown>[]] = await Promise.all([
    model.count({ where }),
    model.findMany({ where, include: e.include, orderBy: sort ? { [sort]: dir } : e.orderBy ?? { id: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const href = (patch: SP) => {
    const p = new URLSearchParams();
    const merged: SP = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !["error", "saved", "deleted"].includes(k)) p.set(k, v);
    const s = p.toString();
    return `/master/${entity}${s ? `?${s}` : ""}`;
  };

  const cell = (r: Record<string, unknown>, c: Col) => {
    const v = pick(r, c.key);
    switch (c.kind) {
      case "badge": return v ? <Badge s={String(v)} /> : "";
      case "bool": return v ? <span className="text-brand">●</span> : <span className="text-steel-200">○</span>;
      case "num": {
        const low = c.warnBelow && typeof v === "number" && v < (r[c.warnBelow] as number);
        return <span className={`tabular-nums ${low ? "font-semibold text-red-600" : ""}`}>{fmt(v as number)}</span>;
      }
      case "money": return <span className="tabular-nums">{fmt(v as number)}</span>;
      case "date": return v ? new Date(v as string).toLocaleDateString() : "";
      case "tags": return <div className="flex gap-1">{c.tags!.filter(([k]) => r[k]).map(([k, l]) => <span key={k} className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-brand">{l}</span>)}</div>;
      default: return <span className={c.mono ? "font-mono text-xs" : ""}>{(v as string) ?? ""}</span>;
    }
  };

  const del = deleteRecord.bind(null, entity);
  const activeFilters = (e.filters ?? []).some((f) => sp[f.field]) || (e.boolFilters ?? []).some((f) => sp[f.field]) || q;

  return (
    <div>
      <PageHead title={e.title} sub={`${total} record${total === 1 ? "" : "s"}${activeFilters ? " (filtered)" : ""}`}>
        <Link href={`/master/${entity}/new`} className={btn}><Plus size={15} /> New {e.singular.toLowerCase()}</Link>
      </PageHead>

      {sp.error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{sp.error}</div>}
      {sp.saved && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Saved successfully.</div>}
      {sp.deleted && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Deleted.</div>}

      <form className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-steel-200 bg-white p-3 shadow-sm" action={`/master/${entity}`}>
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-muted" />
          <input name="q" defaultValue={q} placeholder={`Search ${e.search.join(", ")}…`} className={`${input} w-72 pl-8`} />
        </div>
        {(e.filters ?? []).map((f) => (
          <select key={f.field} name={f.field} defaultValue={sp[f.field] ?? ""} className={input}>
            <option value="">{f.label}: all</option>
            {f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}
        {(e.boolFilters ?? []).map((f) => (
          <select key={f.field} name={f.field} defaultValue={sp[f.field] ?? ""} className={input}>
            <option value="">{f.label}: any</option>
            <option value="1">{f.label}: yes</option>
            <option value="0">{f.label}: no</option>
          </select>
        ))}
        <select name="size" defaultValue={String(pageSize)} className={input}>{[15, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
        <button className={btn2}>Apply</button>
        {activeFilters && <Link href={`/master/${entity}`} className="text-sm text-brand hover:underline">Clear</Link>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-left text-[11px] uppercase tracking-wider text-blue-100">
            <tr>
              <th className="w-10 px-3 py-2.5 font-medium">#</th>
              {e.columns.map((c) => {
                const sortable = !c.key.includes(".") && c.kind !== "tags";
                const on = sort === c.key;
                return (
                  <th key={c.key} className="whitespace-nowrap px-3 py-2.5 font-medium">
                    {sortable ? <Link href={href({ sort: c.key, dir: on && dir === "asc" ? "desc" : "asc", page: "1" })} className="hover:text-white">{c.label}{on ? (dir === "asc" ? " ▲" : " ▼") : ""}</Link> : c.label}
                  </th>
                );
              })}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-steel-100 [&>tr:hover]:bg-blue-50/40">
            {rows.map((r, i) => (
              <tr key={r.id as number}>
                <td className={`${td} text-xs text-muted`}>{(page - 1) * pageSize + i + 1}</td>
                {e.columns.map((c, ci) => (
                  <td key={c.key} className={td}>
                    {ci === 0 ? <Link href={`/master/${entity}/${r.id}`} className="font-medium text-brand hover:underline">{cell(r, c)}</Link> : cell(r, c)}
                  </td>
                ))}
                <td className={`${td} whitespace-nowrap text-right`}>
                  <Link href={`/master/${entity}/${r.id}`} className={`${btn2} !px-2`} title="Edit"><Pencil size={14} /></Link>{" "}
                  <form action={del} className="inline">
                    <input type="hidden" name="id" value={r.id as number} />
                    <ConfirmButton message={`Delete this ${e.singular.toLowerCase()}?`} className="inline-flex items-center rounded-md border border-red-200 bg-white px-2 py-1.5 text-red-700 hover:bg-red-50"><Trash2 size={14} /></ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="p-10 text-center text-sm text-muted">No records match.</div>}
        <div className="flex items-center justify-between border-t border-steel-100 px-3 py-2 text-xs text-muted">
          <span>{total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "0 records"}</span>
          <div className="flex items-center gap-1">
            {page > 1 && <Link href={href({ page: String(page - 1) })} className={`${btn2} !py-1`}>‹ Prev</Link>}
            <span className="px-2">Page {page} / {pages}</span>
            {page < pages && <Link href={href({ page: String(page + 1) })} className={`${btn2} !py-1`}>Next ›</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
