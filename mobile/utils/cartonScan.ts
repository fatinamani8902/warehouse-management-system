export type CartonScanValidationInput = {
  scannedValue?: string | null;
  expectedCartonId?: string | null;
  blockedIds?: Array<string | null | undefined>;
};

export type CartonScanValidationResult = {
  valid: boolean;
  cartonId: string;
  message: string;
};

const CARTON_LABEL_PATTERN = /^(CTN|CARTON)[A-Z0-9-]*$/i;

export function normalizeScannedCarton(value?: string | null): string {
  return String(value ?? "").trim();
}

export function normalizeCartonForMatch(value?: string | null): string {
  return normalizeScannedCarton(value).toUpperCase();
}

export function getCartonQrPayload(cartonId?: string | null): string {
  return normalizeCartonForMatch(cartonId);
}

export function cartonIdsMatch(scannedValue?: string | null, expectedCartonId?: string | null): boolean {
  const scanned = normalizeCartonForMatch(scannedValue);
  const expected = normalizeCartonForMatch(expectedCartonId);
  return Boolean(scanned && expected && scanned === expected);
}

export function validateScannedCartonLabel(input: CartonScanValidationInput): CartonScanValidationResult {
  const cartonId = normalizeScannedCarton(input.scannedValue);
  const normalizedCartonId = normalizeCartonForMatch(cartonId);
  const expectedCartonId = normalizeScannedCarton(input.expectedCartonId);
  const blockedIds = (input.blockedIds ?? [])
    .map((value) => normalizeCartonForMatch(value))
    .filter(Boolean);

  if (!cartonId) {
    return {
      valid: false,
      cartonId,
      message: "Invalid carton label. Please scan a carton QR label.",
    };
  }

  if (blockedIds.includes(normalizedCartonId) || !CARTON_LABEL_PATTERN.test(cartonId)) {
    return {
      valid: false,
      cartonId,
      message: "Invalid carton label. Please scan a carton QR label.",
    };
  }

  if (expectedCartonId && !cartonIdsMatch(cartonId, expectedCartonId)) {
    return {
      valid: false,
      cartonId,
      message: "Carton ID mismatch. Please scan the assigned carton label.",
    };
  }

  return {
    valid: true,
    cartonId,
    message: "",
  };
}
