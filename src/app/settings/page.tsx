import { Settings } from "lucide-react";
import { db } from "@/lib/db";
import { act } from "@/lib/action";
import { SETTING_DEFS, getSettings } from "@/lib/settings";
import { Card, ErrorBanner, PageHead, btn, input } from "@/components/ui";

export const dynamic = "force-dynamic";

async function save(formData: FormData) {
  "use server";
  await act("/settings", async () => {
    for (const d of SETTING_DEFS) {
      const value = d.type === "bool" ? (formData.get(d.key) === "on" ? "1" : "0") : String(formData.get(d.key) ?? d.def);
      await db.setting.upsert({ where: { key: d.key }, update: { value }, create: { key: d.key, value } });
    }
  });
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const s = await getSettings();
  return (
    <div>
      <PageHead title="Rules & settings" sub="Behaviour switches for the manufacturing module" icon={Settings} />
      <ErrorBanner error={error} />
      <Card>
        <form action={save} className="space-y-4">
          {SETTING_DEFS.map((d) => (
            <label key={d.key} className="flex items-center justify-between gap-4 border-b border-steel-100 pb-3 text-sm">
              <span>{d.label}</span>
              {d.type === "bool" ? (
                <input type="checkbox" name={d.key} defaultChecked={s[d.key] === "1"} className="h-5 w-5 accent-blue-600" />
              ) : (
                <input type="number" name={d.key} defaultValue={s[d.key]} className={`${input} w-24`} />
              )}
            </label>
          ))}
          <button className={btn}>Save settings</button>
        </form>
      </Card>
    </div>
  );
}
