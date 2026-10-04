import { db } from "./db";

export const SETTING_DEFS = [
  { key: "mustConsumeAllEssential", label: "Essential materials must be consumed before an operation can be completed", type: "bool", def: "1" },
  { key: "autoAcceptRequests", label: "Auto-accept production requests (creates a draft order)", type: "bool", def: "0" },
  { key: "nearDeliveryDays", label: "Days before planned end to flag an order as near delivery", type: "number", def: "7" },
  { key: "workingHoursPerDay", label: "Effective working hours per day", type: "number", def: "7" },
  { key: "workingDaysPerWeek", label: "Working days per week", type: "number", def: "6" },
] as const;

export type SettingKey = (typeof SETTING_DEFS)[number]["key"];

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.setting.findMany();
  const out = {} as Record<SettingKey, string>;
  for (const d of SETTING_DEFS) out[d.key] = rows.find((r) => r.key === d.key)?.value ?? d.def;
  return out;
}

export async function getBool(key: SettingKey) {
  return (await getSettings())[key] === "1";
}
