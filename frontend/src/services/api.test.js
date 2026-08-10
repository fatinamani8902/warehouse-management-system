import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReturnAuditTrail, fetchRmaAuditTrail, toSessionContext } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toSessionContext", () => {
  it("maps canonical user and role ids and defaults to the assigned warehouse", () => {
    const session = toSessionContext({
      currentTenantId: "TNT000001",
      currentWarehouseId: "",
      currentUser: {
        user_id: "USR000015",
        role_id: "warehouseoperator",
        warehouse_ids: ["WH000001", "WH000002"],
      },
    });

    expect(session).toEqual({
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      user_id: "USR000015",
      role_id: "warehouseoperator",
      token: null,
    });
  });

  it("prefers the selected warehouse over the assigned default warehouse", () => {
    const session = toSessionContext({
      tenant_id: "TNT000001",
      warehouse_id: "WH000009",
      currentUser: {
        id: "USR000015",
        role: "warehouseoperator",
        warehouse_ids: ["WH000001"],
      },
      clerkToken: "token-123",
    });

    expect(session.tenant_id).toBe("TNT000001");
    expect(session.warehouse_id).toBe("WH000009");
    expect(session.user_id).toBe("USR000015");
    expect(session.role_id).toBe("warehouseoperator");
    expect(session.token).toBe("token-123");
  });
});

describe("Returns/RMA audit trail API helpers", () => {
  const session = {
    tenant_id: "TNT000001",
    warehouse_id: "WH000001",
    user_id: "USR000005",
    role_id: "hqadmin",
  };

  it("fetches the Return audit trail from the paginated Returns endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { items: [], total: 0, page: 1, pageSize: 10 } }),
    });

    await fetchReturnAuditTrail(session, "RTN000001", { page: 2, pageSize: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/returns/RTN000001/audit-trail?page=2&pageSize=10");
    expect(fetchMock.mock.calls[0][1].headers["x-tenant-id"]).toBe("TNT000001");
    expect(fetchMock.mock.calls[0][1].headers["x-warehouse-id"]).toBe("WH000001");
  });

  it("fetches the RMA audit trail from the requested plural RMA endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { items: [], total: 0, page: 1, pageSize: 10 } }),
    });

    await fetchRmaAuditTrail(session, "RMA000001", { page: 1, pageSize: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/rmas/RMA000001/audit-trail?page=1&pageSize=10");
  });
});
