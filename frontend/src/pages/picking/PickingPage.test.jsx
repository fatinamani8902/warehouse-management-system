import { describe, expect, it } from "vitest";
import { canShowPickAssignmentAction, pickLineProductName } from "./PickingPage";

describe("PickingPage SKU display", () => {
  it("uses the PostgreSQL sku_name returned for a released pick wave", () => {
    expect(pickLineProductName({
      sku_id: "SKU000006",
      sku_name: "Test Bearing",
      product_name: "Test Bearing",
    })).toBe("Test Bearing");
  });

  it("falls back through compatible product-name fields", () => {
    expect(pickLineProductName({ product_name: "Product" })).toBe("Product");
    expect(pickLineProductName({ sku_description: "Description" })).toBe("Description");
    expect(pickLineProductName({ description: "Legacy description" })).toBe("Legacy description");
  });
});

describe("PickingPage assignment action visibility", () => {
  const pickList = (status, lineOverrides = {}) => ({
    status,
    lines: [
      {
        status,
        qty_picked: 0,
        scan_count: 0,
        ...lineOverrides,
      },
    ],
  });

  it("shows assignment for open pick lists", () => {
    expect(canShowPickAssignmentAction(pickList("open"))).toBe(true);
  });

  it("shows reassignment for assigned pick lists before execution starts", () => {
    expect(canShowPickAssignmentAction(pickList("assigned"))).toBe(true);
  });

  it("hides reassignment once picking is in progress", () => {
    expect(canShowPickAssignmentAction(pickList("in_progress"))).toBe(false);
    expect(canShowPickAssignmentAction(pickList("assigned", { status: "picking" }))).toBe(false);
  });

  it("hides reassignment for picked or completed pick lists", () => {
    expect(canShowPickAssignmentAction(pickList("picked"))).toBe(false);
    expect(canShowPickAssignmentAction(pickList("completed"))).toBe(false);
    expect(canShowPickAssignmentAction(pickList("assigned", { status: "done" }))).toBe(false);
  });

  it("hides reassignment for cancelled pick lists", () => {
    expect(canShowPickAssignmentAction(pickList("cancelled"))).toBe(false);
  });

  it("hides reassignment when any picked quantity exists", () => {
    expect(canShowPickAssignmentAction(pickList("assigned", { qty_picked: 1 }))).toBe(false);
    expect(canShowPickAssignmentAction(pickList("assigned", { scan_count: 1 }))).toBe(false);
  });
});
