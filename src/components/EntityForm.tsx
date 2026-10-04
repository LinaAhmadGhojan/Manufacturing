import Link from "next/link";
import { db } from "@/lib/db";
import { LOOKUPS, pick, type Entity, type Field as F } from "@/lib/crud";
import { Card, Field, btn, btn2, input } from "@/components/ui";

type Rec = Record<string, unknown> | null;
type Opt = { id: number | string; label: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (m: string): any => (db as any)[m];

async function options(f: F): Promise<Opt[]> {
  const l = LOOKUPS[f.ref!];
  const rows = await delegate(l.model).findMany({ orderBy: { [l.label]: "asc" } });
  return rows.map((r: Record<string, unknown>) => ({ id: f.refValue === "code" ? (r.code as string) : (r.id as number), label: `${r[l.label]}${l.extra ? ` (${r[l.extra]})` : ""}` }));
}

const width = { sm: "md:col-span-1", md: "md:col-span-2", lg: "md:col-span-3", full: "md:col-span-6" } as const;

export default async function EntityForm({
  entity, rec, action, cancelHref, draft,
}: { entity: Entity; rec: Rec; action: (fd: FormData) => Promise<void>; cancelHref: string; draft?: Record<string, string> }) {
  const editing = !!rec;
  const optMap: Record<string, Opt[]> = {};
  for (const f of entity.fields) if ((f.type === "ref" || f.type === "multi") && !optMap[f.name]) optMap[f.name] = await options(f);

  const sections = [...new Set(entity.fields.map((f) => f.section ?? "General"))];

  return (
    <form action={action} className="space-y-5">
      {sections.map((sec) => (
        <Card key={sec} title={sec}>
          <div className="grid gap-4 md:grid-cols-6">
            {entity.fields.filter((f) => (f.section ?? "General") === sec).map((f) => {
              const val = draft ? (f.type === "bool" ? f.name in draft : draft[f.name]) : rec ? (rec[f.name] as unknown) : f.def;
              const disabled = editing && f.createOnly;
              const cls = `${width[f.width ?? "md"]} col-span-full`;
              let control: React.ReactNode;
              if (f.type === "bool") {
                control = (
                  <label className="flex items-center gap-2 pt-5 text-sm text-ink">
                    <input type="checkbox" name={f.name} defaultChecked={!!val} className="h-4 w-4 accent-blue-600" /> {f.label}
                  </label>
                );
              } else {
                let inner: React.ReactNode;
                if (f.type === "textarea") inner = <textarea name={f.name} rows={3} defaultValue={(val as string) ?? ""} className={input} />;
                else if (f.type === "select") inner = <select name={f.name} defaultValue={(val as string) ?? ""} className={input}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>;
                else if (f.type === "ref")
                  inner = (
                    <select name={f.name} defaultValue={val == null ? "" : String(val)} className={input}>
                      <option value="">—</option>
                      {optMap[f.name].map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  );
                else if (f.type === "multi") {
                  const chosen = new Set(((rec?.[f.multi!.rel] as Record<string, unknown>[]) ?? []).map((x) => Number(x[f.multi!.other])));
                  inner = (
                    <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-steel-200 p-2 sm:grid-cols-2 lg:grid-cols-3">
                      {optMap[f.name].map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
                          <input type="checkbox" name={f.name} value={o.id} defaultChecked={chosen.has(Number(o.id))} className="h-4 w-4 accent-blue-600" /> {o.label}
                        </label>
                      ))}
                      {!optMap[f.name].length && <span className="text-sm text-muted">Nothing to choose yet</span>}
                    </div>
                  );
                } else if (f.type === "lines") {
                  const rows = (pick(rec, f.lines!.rel) as Record<string, unknown>[]) ?? [];
                  inner = <textarea name={f.name} rows={Math.max(5, rows.length + 2)} defaultValue={rows.map((r) => f.lines!.format(r)).join("\n")} className={`${input} font-mono`} />;
                } else if (f.type === "date")
                  inner = <input type="date" name={f.name} defaultValue={val ? new Date(val as string).toISOString().slice(0, 10) : ""} className={input} />;
                else
                  inner = <input type={f.type === "number" ? "number" : "text"} step="any" name={f.name} required={f.required} defaultValue={(val as string | number) ?? ""} disabled={disabled} className={`${input} disabled:bg-steel-50`} />;
                control = (
                  <Field label={`${f.label}${f.required ? " *" : ""}`}>
                    {inner}
                    {f.help && <span className="font-normal text-muted">{f.help}</span>}
                  </Field>
                );
              }
              return <div key={f.name} className={cls}>{control}</div>;
            })}
          </div>
        </Card>
      ))}
      <div className="flex gap-2">
        <button className={btn}>{editing ? "Save changes" : `Create ${entity.singular.toLowerCase()}`}</button>
        <Link href={cancelHref} className={btn2}>Cancel</Link>
      </div>
    </form>
  );
}
