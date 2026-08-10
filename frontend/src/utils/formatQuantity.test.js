import { describe, expect, it } from "vitest";
import { formatQuantity } from "./formatQuantity";

describe("formatQuantity", () => {
  it("shows whole quantities without trailing decimals", () => {
    expect(formatQuantity(10)).toBe("10");
    expect(formatQuantity(25)).toBe("25");
    expect(formatQuantity("10.0000")).toBe("10");
    expect(formatQuantity("1234.0000")).toBe("1,234");
  });

  it("shows fractional quantities with two decimal places", () => {
    expect(formatQuantity(10.5)).toBe("10.50");
    expect(formatQuantity("10.25")).toBe("10.25");
    expect(formatQuantity("1234.5")).toBe("1,234.50");
  });

  it("supports a display fallback", () => {
    expect(formatQuantity(null)).toBe("-");
    expect(formatQuantity("", "-")).toBe("-");
    expect(formatQuantity("invalid", "-")).toBe("-");
  });
});
