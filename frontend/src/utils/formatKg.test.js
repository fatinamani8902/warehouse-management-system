import { describe, expect, it } from "vitest";
import { formatKg } from "./formatKg";

describe("formatKg", () => {
  it("renders exactly two decimals with kg", () => {
    expect(formatKg(3)).toBe("3.00 kg");
    expect(formatKg(3.5)).toBe("3.50 kg");
    expect(formatKg(3.456)).toBe("3.46 kg");
    expect(formatKg(0.1)).toBe("0.10 kg");
  });
});
