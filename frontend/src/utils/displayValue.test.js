import { describe, expect, it } from "vitest";
import { displayValue } from "./displayValue";

describe("displayValue", () => {
  it("uses a hyphen for empty and invalid display values", () => {
    expect(displayValue(null)).toBe("-");
    expect(displayValue(undefined)).toBe("-");
    expect(displayValue("")).toBe("-");
    expect(displayValue("   ")).toBe("-");
    expect(displayValue("null")).toBe("-");
    expect(displayValue("undefined")).toBe("-");
    expect(displayValue("NaN")).toBe("-");
    expect(displayValue(Number.NaN)).toBe("-");
    expect(displayValue("\uFFFD")).toBe("-");
  });

  it("preserves valid values", () => {
    expect(displayValue("RTN000003")).toBe("RTN000003");
    expect(displayValue(0)).toBe(0);
    expect(displayValue("0")).toBe("0");
  });
});
