import { notFound } from "next/navigation";
import { ENTITIES } from "@/lib/crud";
import { ErrorBanner, PageHead } from "@/components/ui";
import EntityForm from "@/components/EntityForm";
import { saveRecord } from "../../actions";

export const dynamic = "force-dynamic";

export default async function NewRecord({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<{ error?: string; d?: string }> }) {
  const { entity } = await params;
  const e = ENTITIES[entity];
  if (!e) notFound();
  const { error, d } = await searchParams;
  const draft = d ? (() => { try { return JSON.parse(d) as Record<string, string>; } catch { return undefined; } })() : undefined;
  return (
    <div>
      <PageHead title={`New ${e.singular.toLowerCase()}`} sub={e.title} />
      <ErrorBanner error={error} />
      <EntityForm draft={draft} entity={e} rec={null} action={saveRecord.bind(null, entity, null)} cancelHref={`/master/${entity}`} />
    </div>
  );
}
