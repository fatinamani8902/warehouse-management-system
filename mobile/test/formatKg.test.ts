import assert from "node:assert/strict";
import test from "node:test";
import { formatKg } from "../utils/formatKg.ts";

test("formatKg renders exactly two decimals with kg", () => {
  assert.equal(formatKg(3), "3.00 kg");
  assert.equal(formatKg(3.5), "3.50 kg");
  assert.equal(formatKg(3.456), "3.46 kg");
  assert.equal(formatKg(0.1), "0.10 kg");
});
