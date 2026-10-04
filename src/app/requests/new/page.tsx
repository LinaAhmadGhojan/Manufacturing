import { Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { ErrorBanner, PageHead } from "@/components/ui";
import RequestForm from "@/components/RequestForm";
import { createRequestAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [boms, clients] = await Promise.all([db.bom.findMany({ where: { active: true }, include: { product: true } }), db.client.findMany({ where: { active: true } })]);
  return (
    <div>
      <PageHead title="New production request" icon={Inbox} />
      <ErrorBanner error={error} />
      <RequestForm action={createRequestAction} submit="Submit request" boms={boms.map((b) => ({ id: b.id, label: `${b.product.name} — ${b.name}` }))} clients={clients.map((c) => ({ id: c.id, label: c.name }))} />
    </div>
  );
}
