import { describe, expect, it } from "vitest";
import { formatPackingType } from "./formatPackingType";

describe("formatPackingType", () => {
  it("renders friendly packing labels", () => {
    expect(formatPackingType("standard_box")).toBe("Standard Box");
    expect(formatPackingType("poly_mailer")).toBe("Poly Mailer");
    expect(formatPackingType("pallet")).toBe("Pallet");
    expect(formatPackingType("crate")).toBe("Crate");
    expect(formatPackingType("custom_wrap")).toBe("Custom Wrap");
  });
});
