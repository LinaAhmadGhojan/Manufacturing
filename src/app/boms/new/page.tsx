import { ErrorBanner, PageHead } from "@/components/ui";
import { Network } from "lucide-react";
import BomEditor from "../BomEditor";
import { bomLookups } from "../lookups";
import { saveBom } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewBom({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div>
      <PageHead title="New BOM" sub="Materials, routing, equipment, readings and expenses per operation" icon={Network} />
      <ErrorBanner error={error} />
      <BomEditor action={saveBom.bind(null, null)} lookups={await bomLookups()}
        initial={{ name: "", productId: 0, outputQty: 1, durationHrs: 0, isDefault: false, serialBase: false, prodLevelQc: false, model: "", refrigerant: "", voltage: "", remark: "", materials: [], operations: [] }} />
    </div>
  );
}
