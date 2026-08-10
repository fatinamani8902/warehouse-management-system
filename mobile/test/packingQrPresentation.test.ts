import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const screenSource = readFileSync(
  resolve("app/(app)/packing/[packId].tsx"),
  "utf8",
);

test("packing QR component receives raw payload and scannable render props", () => {
  assert.match(screenSource, /<CartonQrCode value=\{cartonIdForDisplay\} \/>/);
  assert.match(screenSource, /value=\{value\}/);
  assert.match(screenSource, /size=\{CARTON_QR_SIZE\}/);
  assert.match(screenSource, /color=\{CARTON_QR_COLOR\}/);
  assert.match(screenSource, /backgroundColor=\{CARTON_QR_BACKGROUND\}/);
  assert.match(screenSource, /ecl=\{CARTON_QR_ERROR_CORRECTION\}/);
  assert.equal(/quietZone=/.test(screenSource), false);
});

test("packing QR label uses parent quiet zone without clipping", () => {
  assert.match(screenSource, /<View style=\{CARTON_QR_LABEL_STYLE\}>/);
});

test("packing scanner wiring remains attached to Expo CameraView for QR", () => {
  assert.match(screenSource, /barcodeScannerSettings=\{\{ barcodeTypes: \["qr", "code128", "code39", "ean13", "ean8"\] \}\}/);
  assert.match(screenSource, /onBarcodeScanned=\{scanResult === "idle" \? handleBarcode : undefined\}/);
  assert.match(screenSource, /const handleBarcode = useCallback\(\(\{ data \}: \{ data: string \}\) =>/);
});
