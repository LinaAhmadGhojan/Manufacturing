"use server";

import { act, num, str } from "@/lib/action";
import { recordQc } from "@/lib/exec";

export async function qcAction(formData: FormData) {
  const result = str(formData.get("result")) as "PASS" | "FAIL";
  await act("/qc", () =>
    recordQc({
      stepId: num(formData.get("stepId")),
      result,
      failAction: (str(formData.get("failAction")) || undefined) as "RETURN_TO_TECH" | "HOLD" | "SCRAP" | undefined,
      remark: str(formData.get("remark")) || undefined,
    }),
  );
}
