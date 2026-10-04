import { test } from "node:test";
import assert from "node:assert/strict";
import { nextNumber } from "./numbering";

test("first document is 000001", () => assert.equal(nextNumber("PO"), "PO-000001"));
test("increments the highest existing number", () => {
  assert.equal(nextNumber("PO", "PO-000001"), "PO-000002");
  assert.equal(nextNumber("PR", "PR-000099"), "PR-000100");
  assert.equal(nextNumber("PRQ", "PRQ-001234"), "PRQ-001235");
});
