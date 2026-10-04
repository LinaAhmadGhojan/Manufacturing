import { test } from "node:test";
import assert from "node:assert/strict";
import { code128Modules, code128Patterns, code128Values } from "./code128";

test("every pattern is well formed (6 elements summing to 11, stop has 7 summing to 13)", () => {
  code128Patterns.forEach((p, i) => {
    const sum = p.split("").reduce((s, d) => s + Number(d), 0);
    if (i === 106) { assert.equal(p.length, 7); assert.equal(sum, 13); }
    else { assert.equal(p.length, 6, `pattern ${i}`); assert.equal(sum, 11, `pattern ${i}`); }
  });
  assert.equal(new Set(code128Patterns).size, 107, "patterns are unique");
});

test("checksum for 'PJJ123C' (the well-known example, which gives 54 with Start A)", () => {
  // Start A (103): 103+48+84+126+68+90+114+245 = 878 → 878 % 103 = 54  (spec example)
  // Start B (104): 879 % 103 = 55 — what this encoder uses.
  const v = code128Values("PJJ123C");
  assert.equal(v[v.length - 2], 55);
  assert.equal((103 + 48 + 2 * 42 + 3 * 42 + 4 * 17 + 5 * 18 + 6 * 19 + 7 * 35) % 103, 54);
});

test("encoded width = 11 modules per symbol + 13 for the stop", () => {
  const text = "PO-000123-0004";
  const total = code128Modules(text).reduce((a, b) => a + b, 0);
  assert.equal(total, 11 * (text.length + 2) + 13);
});

test("rejects non-ASCII", () => {
  assert.throws(() => code128Values("é"));
});
