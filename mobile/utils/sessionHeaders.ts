export interface SessionIdentity {
  tenant_id?: string;
  warehouse_id?: string;
  warehouse_ids?: string[];
  user_id?: string;
  role_id?: string;
}

export function resolveWarehouseId(session: SessionIdentity): string {
  return (
    session.warehouse_id
    || session.warehouse_ids?.[0]
    || ""
  );
}

export function buildSessionHeaders(session: SessionIdentity) {
  return {
    "x-tenant-id": session.tenant_id || "",
    "x-warehouse-id": resolveWarehouseId(session),
    "x-user-id": session.user_id || "",
    "x-roles": session.role_id || "",
  };
}
