import { describe, expect, it } from "vitest";
import {
  canCancelDocument,
  canCancelOutbound,
  canCreateOutbound,
  canApproveAdjustment,
  canCancelAdjustment,
  canCreateAsn,
  canCreateAdjustment,
  canRejectAdjustment,
  canReleaseOutbound,
  canTransition,
  normalizeRole,
} from "./rbac";

describe("inbound ASN RBAC helpers", () => {
  it("allows ASN creation for superadmin and hqadmin roles", () => {
    expect(canCreateAsn("superadmin")).toBe(true);
    expect(canCreateAsn("hqadmin")).toBe(true);
    expect(canCreateAsn("Super Admin")).toBe(true);
    expect(canCreateAsn("HQ Admin")).toBe(true);
  });

  it("hides ASN creation for non-maker inbound roles", () => {
    expect(canCreateAsn("storeoperator")).toBe(false);
    expect(canCreateAsn("manager")).toBe(false);
    expect(canCreateAsn("warehousemanager")).toBe(false);
    expect(canCreateAsn("storemanager")).toBe(false);
    expect(canCreateAsn("auditor")).toBe(false);
  });

  it("normalizes role values to lowercase canonical IDs", () => {
    expect(normalizeRole("HQ Admin")).toBe("hqadmin");
    expect(normalizeRole("Super Admin")).toBe("superadmin");
    expect(normalizeRole("warehousemanager")).toBe("storemanager");
  });

  it("allows superadmin to manage draft ASN workflow actions", () => {
    expect(canTransition("superadmin", "asn", "submit")).toBe(true);
    expect(canCancelDocument("superadmin")).toBe(true);
    expect(canTransition("superadmin", "asn", "mark_in_transit")).toBe(false);
    expect(canTransition("superadmin", "asn", "mark_arrived")).toBe(false);
  });

  it("allows outbound manager aliases to use configured manager actions", () => {
    for (const role of ["warehousemanager", "manager", "whmanager", "storemanager"]) {
      expect(canReleaseOutbound(role)).toBe(true);
      expect(canCancelOutbound(role)).toBe(false);
    }
  });

  it("aligns outbound create visibility with backend create roles", () => {
    expect(canCreateOutbound("superadmin")).toBe(true);
    expect(canCreateOutbound("hqadmin")).toBe(true);
    expect(canCreateOutbound("admin")).toBe(true);
    expect(canCreateOutbound("storemanager")).toBe(false);
    expect(canCreateOutbound("warehousemanager")).toBe(false);
    expect(canCreateOutbound("storeoperator")).toBe(false);
  });

  it("normalizes warehousemanager to the canonical adjustment manager role", () => {
    expect(canCreateAdjustment("warehousemanager")).toBe(true);
    expect(canApproveAdjustment("warehousemanager")).toBe(true);
    expect(canRejectAdjustment("warehousemanager")).toBe(true);
    expect(canCancelAdjustment("warehousemanager")).toBe(true);
  });
});
