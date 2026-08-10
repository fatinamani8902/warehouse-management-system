import assert from "node:assert/strict";
import test from "node:test";
import {
  cartonIdsMatch,
  getCartonQrPayload,
  normalizeCartonForMatch,
  validateScannedCartonLabel,
} from "../utils/cartonScan.ts";
import {
  CARTON_QR_BACKGROUND,
  CARTON_QR_COLOR,
  CARTON_QR_ERROR_CORRECTION,
  CARTON_QR_LABEL_PADDING,
  CARTON_QR_LABEL_STYLE,
  CARTON_QR_SIZE,
} from "../utils/cartonQr.ts";

test("carton QR payload is the raw carton id", () => {
  assert.equal(getCartonQrPayload("CTN000001"), "CTN000001");
});

test("carton QR payload trims accidental reserved id whitespace", () => {
  assert.equal(getCartonQrPayload("  ctn000001  "), "CTN000001");
});

test("carton QR render config uses a scannable black and white label", () => {
  assert.equal(getCartonQrPayload("ctn000006"), "CTN000006");
  assert.equal(CARTON_QR_SIZE, 240);
  assert.equal(CARTON_QR_ERROR_CORRECTION, "Q");
  assert.equal(CARTON_QR_COLOR, "#000000");
  assert.equal(CARTON_QR_BACKGROUND, "#FFFFFF");
  assert.equal(CARTON_QR_LABEL_PADDING >= 24, true);
  assert.equal(CARTON_QR_LABEL_STYLE.backgroundColor, "#FFFFFF");
  assert.equal(CARTON_QR_LABEL_STYLE.padding, 24);
  assert.equal(CARTON_QR_LABEL_STYLE.overflow, "visible");
  assert.equal("quietZone" in CARTON_QR_LABEL_STYLE, false);
});

test("carton matching normalizes scanned and reserved ids", () => {
  assert.equal(normalizeCartonForMatch(" ctn000001 "), "CTN000001");
  assert.equal(cartonIdsMatch(" ctn000001 ", " CTN000001 "), true);
});

test("scanning pack order id does not produce a carton id", () => {
  const result = validateScannedCartonLabel({
    scannedValue: "PAC000003",
    blockedIds: ["PAC000003", "WAV000007", "SAL990004"],
  });

  assert.equal(result.valid, false);
  assert.equal(result.cartonId, "PAC000003");
  assert.equal(result.message, "Invalid carton label. Please scan a carton QR label.");
});

test("scanning a valid CTN carton id is accepted", () => {
  const result = validateScannedCartonLabel({
    scannedValue: "CTN000001",
    blockedIds: ["PAC000003", "WAV000007", "SAL990004"],
  });

  assert.equal(result.valid, true);
  assert.equal(result.cartonId, "CTN000001");
  assert.equal(result.message, "");
});

test("scanning another carton id is rejected when a reserved carton exists", () => {
  const result = validateScannedCartonLabel({
    scannedValue: "CTN000002",
    expectedCartonId: "CTN000001",
    blockedIds: ["PAC000003", "WAV000007", "SAL990004"],
  });

  assert.equal(result.valid, false);
  assert.equal(result.cartonId, "CTN000002");
  assert.equal(result.message, "Carton ID mismatch. Please scan the assigned carton label.");
});

test("scanning the reserved carton id is accepted", () => {
  const result = validateScannedCartonLabel({
    scannedValue: "CTN000001",
    expectedCartonId: "CTN000001",
    blockedIds: ["PAC000003", "WAV000007", "SAL990004"],
  });

  assert.equal(result.valid, true);
  assert.equal(result.cartonId, "CTN000001");
});

test("scanning the reserved carton id is case-insensitive and trims whitespace", () => {
  const result = validateScannedCartonLabel({
    scannedValue: " ctn000001 ",
    expectedCartonId: " CTN000001 ",
    blockedIds: ["PAC000003", "WAV000007", "SAL990004"],
  });

  assert.equal(result.valid, true);
  assert.equal(result.cartonId, "ctn000001");
});

test("confirmation fallback should be used when no carton was scanned", () => {
  const result = validateScannedCartonLabel({
    scannedValue: "",
    blockedIds: ["PAC000003"],
  });

  assert.equal(result.valid, false);
  assert.equal(result.cartonId, "");
});
