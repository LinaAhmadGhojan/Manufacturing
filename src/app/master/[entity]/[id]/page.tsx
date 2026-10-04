import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ENTITIES } from "@/lib/crud";
import { ErrorBanner, PageHead } from "@/components/ui";
import EntityForm from "@/components/EntityForm";
import { saveRecord } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditRecord({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ error?: string; d?: string }> }) {
  const { entity, id } = await params;
  const e = ENTITIES[entity];
  if (!e || !Number(id)) notFound();
  const { error, d } = await searchParams;
  const draft = d ? (() => { try { return JSON.parse(d) as Record<string, string>; } catch { return undefined; } })() : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec = await (db as any)[e.model].findUnique({ where: { id: Number(id) }, include: e.include });
  if (!rec) notFound();
  return (
    <div>
      <PageHead title={`Edit ${e.singular.toLowerCase()}`} sub={`${e.title} · #${id}`} />
      <ErrorBanner error={error} />
      <EntityForm draft={draft} entity={e} rec={rec} action={saveRecord.bind(null, entity, Number(id))} cancelHref={`/master/${entity}`} />
    </div>
  );
}
