"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ENTITIES, type Entity } from "@/lib/crud";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (model: string): any => (db as any)[model];

function parse(e: Entity, fd: FormData, editing: boolean) {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of e.fields) {
    if (f.type === "multi" || f.type === "lines") continue;
    if (editing && f.createOnly) continue;
    const raw = fd.get(f.name);
    const s = raw === null ? "" : String(raw).trim();
    if (f.required && !s && f.type !== "bool") errors.push(`${f.label} is required`);
    switch (f.type) {
      case "bool": data[f.name] = raw === "on"; break;
      case "number": data[f.name] = s === "" ? (f.def ?? null) : Number(s); if (s !== "" && Number.isNaN(data[f.name])) errors.push(`${f.label} must be a number`); break;
      case "date": data[f.name] = s ? new Date(s) : null; break;
      case "ref": data[f.name] = s === "" ? null : f.refValue === "code" ? s : Number(s); break;
      default: data[f.name] = s === "" && !f.required ? null : s;
    }
  }
  return { data, errors };
}

export async function saveRecord(key: string, id: number | null, fd: FormData) {
  const e = ENTITIES[key];
  const back = id ? `/master/${key}/${id}` : `/master/${key}/new`;
  const { data, errors } = parse(e, fd, !!id);
  const draft = encodeURIComponent(JSON.stringify(Object.fromEntries([...fd.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")))));
  if (errors.length) redirect(`${back}?error=${encodeURIComponent(errors.join(" · "))}&d=${draft}`);

  let savedId = id;
  try {
    savedId = await db.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (m: string) => (tx as any)[m];
      const rec = id ? await d(e.model).update({ where: { id }, data }) : await d(e.model).create({ data });
      for (const f of e.fields) {
        if (f.type === "multi" && f.multi) {
          const ids = fd.getAll(f.name).map(Number).filter(Boolean);
          await d(f.multi.join).deleteMany({ where: { [f.multi.own]: rec.id } });
          if (ids.length) await d(f.multi.join).createMany({ data: ids.map((x) => ({ [f.multi!.own]: rec.id, [f.multi!.other]: x })) });
        }
        if (f.type === "lines" && f.lines) {
          const rows = String(fd.get(f.name) ?? "").split("\n").map((l) => f.lines!.parse(l)).filter(Boolean) as Record<string, unknown>[];
          await d(f.lines.model).deleteMany({ where: { [f.lines.own]: rec.id } });
          if (rows.length) await d(f.lines.model).createMany({ data: rows.map((r) => ({ ...r, [f.lines!.own]: rec.id })) });
        }
      }
      return rec.id as number;
    });
  } catch (err) {
    const msg = (err as { code?: string }).code === "P2002" ? "A record with the same code/name already exists" : (err as Error).message.split("\n").pop() ?? "Save failed";
    redirect(`${back}?error=${encodeURIComponent(msg)}&d=${draft}`);
  }
  revalidatePath("/", "layout");
  redirect(`/master/${key}?saved=${savedId}`);
}

export async function deleteRecord(key: string, fd: FormData) {
  const e = ENTITIES[key];
  const id = Number(fd.get("id"));
  let err: string | null = null;
  try {
    await delegate(e.model).delete({ where: { id } });
  } catch {
    err = `Cannot delete this ${e.singular.toLowerCase()}: it is used by other records. Deactivate it instead.`;
  }
  revalidatePath("/", "layout");
  redirect(`/master/${key}${err ? `?error=${encodeURIComponent(err)}` : "?deleted=1"}`);
}
