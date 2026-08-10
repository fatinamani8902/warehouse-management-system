import assert from "node:assert/strict";
import test from "node:test";
import { formatPackingType } from "../utils/formatPackingType.ts";

test("formatPackingType renders friendly labels", () => {
  assert.equal(formatPackingType("standard_box"), "Standard Box");
  assert.equal(formatPackingType("poly_mailer"), "Poly Mailer");
  assert.equal(formatPackingType("pallet"), "Pallet");
  assert.equal(formatPackingType("crate"), "Crate");
  assert.equal(formatPackingType("custom_wrap"), "Custom Wrap");
});
