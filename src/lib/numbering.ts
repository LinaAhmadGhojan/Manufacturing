/** Next document number from the highest existing one (immune to id gaps after deletes/reseeds). */
export function nextNumber(prefix: string, lastNo?: string | null) {
  const n = lastNo ? parseInt(lastNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `${prefix}-${String(n + 1).padStart(6, "0")}`;
}
