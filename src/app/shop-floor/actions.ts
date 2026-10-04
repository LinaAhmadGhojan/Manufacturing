"use server";

import { act, num } from "@/lib/action";
import { completeStep, logEquipment, logTime, recordReading, verifyStep } from "@/lib/exec";

const back = (fd: FormData) => `/shop-floor?order=${num(fd.get("order"))}`;

export async function logTimeAction(fd: FormData) {
  await act(back(fd), () => logTime({ stepId: num(fd.get("stepId")), memberId: num(fd.get("memberId")), minutes: num(fd.get("minutes")) }));
}
export async function logEquipmentAction(fd: FormData) {
  await act(back(fd), () => logEquipment({ stepId: num(fd.get("stepId")), assetId: num(fd.get("assetId")), minutes: num(fd.get("minutes")) }));
}
export async function readingAction(fd: FormData) {
  await act(back(fd), async () => {
    const r = await recordReading({ stepId: num(fd.get("stepId")), parameterId: num(fd.get("parameterId")), value: num(fd.get("value")) });
    if (!r.inRange) throw new Error("Reading saved, but it is OUT OF RANGE — inform the supervisor / QC");
  });
}
export async function completeStepAction(fd: FormData) {
  await act(back(fd), () => completeStep(num(fd.get("stepId"))));
}
export async function verifyStepAction(fd: FormData) {
  const order = num(fd.get("order"));
  await act(order ? `/shop-floor?order=${order}` : "/supervisor", () => verifyStep(num(fd.get("stepId"))));
}
