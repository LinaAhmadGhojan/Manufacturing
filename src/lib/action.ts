import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Run a mutation; on failure bounce back to `path` with ?error=… so the page can show it. */
export async function act(path: string, fn: () => Promise<unknown>, successPath?: string) {
  let err: string | null = null;
  try {
    await fn();
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  revalidatePath("/", "layout");
  if (err) redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(err)}`);
  if (successPath) redirect(successPath);
}

export const num = (v: FormDataEntryValue | null, d = 0) => {
  const n = Number(v);
  return v === null || v === "" || Number.isNaN(n) ? d : n;
};
export const str = (v: FormDataEntryValue | null) => (v === null ? "" : String(v)).trim();
