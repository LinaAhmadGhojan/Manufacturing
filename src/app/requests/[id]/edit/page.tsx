import { notFound, redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { ErrorBanner, PageHead } from "@/components/ui";
import RequestForm from "@/components/RequestForm";
import { updateRequestAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const r = await db.productionRequest.findUnique({ where: { id: Number(id) } });
  if (!r) notFound();
  if (r.status !== "NEW") redirect(`/requests?error=${encodeURIComponent("Only new requests can be edited")}`);
  const [boms, clients] = await Promise.all([db.bom.findMany({ where: { active: true }, include: { product: true } }), db.client.findMany({ where: { active: true } })]);
  return (
    <div>
      <PageHead title={`Edit ${r.no}`} icon={Inbox} />
      <ErrorBanner error={error} />
      <RequestForm action={updateRequestAction.bind(null, r.id)} submit="Save changes" init={r} boms={boms.map((b) => ({ id: b.id, label: `${b.product.name} — ${b.name}` }))} clients={clients.map((c) => ({ id: c.id, label: c.name }))} />
    </div>
  );
}
