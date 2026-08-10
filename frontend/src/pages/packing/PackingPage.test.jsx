import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PackingPage from "./PackingPage";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPackingOrderById,
  fetchPackingOrders,
} from "@/services/api";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  fetchPackingOrderById: vi.fn(),
  fetchPackingOrders: vi.fn(),
  toSessionContext: vi.fn((auth) => ({
    tenant_id: auth?.currentTenantId || "TNT000001",
    warehouse_id: auth?.currentWarehouseId || "WH000001",
    user_id: auth?.currentUser?.user_id || "",
    role_id: auth?.currentUser?.role_id || "",
    token: null,
  })),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/Breadcrumbs", () => ({
  Breadcrumbs: () => <div>Breadcrumbs</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

const order = {
  pack_id: "PAC000004",
  wave_id: "WAV000007",
  so_id: "SAL990004",
  order_ref: "SAL990004",
  customer_name: "RetailMax",
  status: "pending",
  pick_list_status: "completed",
  assigned_to_user_id: "USR000015",
  assigned_to_user_display: "Mike Operator (USR000015)",
  packed_by_user_display: null,
  packed_by_display: null,
  carton_id: null,
  packaging_type: null,
  weight_kg: null,
  created_at: "2026-06-26T20:00:00Z",
  packed_at: null,
  lines: [
    {
      line_no: 1,
      sku_id: "SKU000006",
      sku_name: "Test Bearing",
      qty_required: 4,
      location_code: "LOC000002",
    },
  ],
};

function renderPackingPage(roleId, userId, rows = [order], detail = order) {
  useAuth.mockReturnValue({
    currentTenantId: "TNT000001",
    currentWarehouseId: "WH000001",
    currentUser: {
      user_id: userId,
      role_id: roleId,
    },
  });
  fetchPackingOrders.mockResolvedValue({ data: rows, total: rows.length });
  fetchPackingOrderById.mockResolvedValue({ data: detail });

  return render(<PackingPage />);
}

describe("PackingPage monitor-only rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing when the detail has not been selected yet", async () => {
    renderPackingPage("warehousemanager", "USR000002");

    expect(await screen.findByText("Packing")).toBeInTheDocument();
    expect(screen.getByText("Monitor packing orders")).toBeInTheDocument();
  });

  it.each([
    ["superadmin", "USR000001"],
    ["hqadmin", "USR000005"],
    ["storemanager", "USR000002"],
    ["warehousemanager", "USR000002"],
    ["storeoperator", "USR000015"],
  ])("does not render Portal execution actions for %s", async (roleId, userId) => {
    renderPackingPage(roleId, userId);

    fireEvent.click(await screen.findByText("PAC000004"));
    expect(await screen.findByText("Packing execution is completed from the Mobile application by the assigned operator.")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /generate carton label/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm packing/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Packaging Type")).toBeInTheDocument();
    expect(screen.queryByText("Weight (kg)")).toBeInTheDocument();
  });

  it("does not render Portal execution actions for warehouseoperator", async () => {
    renderPackingPage("warehouseoperator", "USR000015");

    expect(await screen.findByText("Packing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate carton label/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm packing/i })).not.toBeInTheDocument();
  });

  it("keeps the packing list and selected detail visible for monitoring", async () => {
    renderPackingPage("warehousemanager", "USR000002", [order], {
      ...order,
      carton_id: "CTN000001",
      packaging_type: "standard_box",
      weight_kg: 2.5,
    });

    expect(await screen.findByText("PAC000004")).toBeInTheDocument();
    fireEvent.click(screen.getByText("PAC000004"));

    await waitFor(() => expect(fetchPackingOrderById).toHaveBeenCalled());
    expect(await screen.findByText("CTN000001")).toBeInTheDocument();
    expect(screen.getByText("Standard Box")).toBeInTheDocument();
    expect(screen.getByText("2.50 kg")).toBeInTheDocument();
    expect(screen.getByText("Mike Operator (USR000015)")).toBeInTheDocument();
  });

  it.each(["completed", "done", "picked"])("displays %s Pick List Status as Picked", async (pickStatus) => {
    renderPackingPage("warehousemanager", "USR000002", [order], {
      ...order,
      status: "pending",
      pick_list_status: pickStatus,
    });

    fireEvent.click(await screen.findByText("PAC000004"));

    expect(await screen.findByText("Packing execution is completed from the Mobile application by the assigned operator.")).toBeInTheDocument();
    expect(screen.getByText("Picked")).toBeInTheDocument();
  });

  it("does not derive Pick List Status from the Packing status", async () => {
    renderPackingPage("warehousemanager", "USR000002", [order], {
      ...order,
      status: "packed",
      pick_list_status: "completed",
    });

    fireEvent.click(await screen.findByText("PAC000004"));

    expect(await screen.findByText("Picked")).toBeInTheDocument();
    expect(screen.getAllByText("Packed").length).toBeGreaterThanOrEqual(2);
  });

  it("uses consistent Packing status labels for active and compatibility statuses", async () => {
    const rows = [
      { ...order, pack_id: "PAC_PENDING", status: "pending" },
      { ...order, pack_id: "PAC_DRAFT", status: "draft" },
      { ...order, pack_id: "PAC_CARTON", status: "carton_generated" },
      { ...order, pack_id: "PAC_PROGRESS", status: "in_progress" },
      { ...order, pack_id: "PAC_PACKED", status: "packed" },
      { ...order, pack_id: "PAC_COMPLETED", status: "completed" },
      { ...order, pack_id: "PAC_SHIPPED", status: "shipped" },
      { ...order, pack_id: "PAC_CANCELLED", status: "cancelled" },
    ];

    renderPackingPage("warehousemanager", "USR000002", rows);

    expect(await screen.findByText("PAC_PENDING")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Packed").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Shipped").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.queryByText("carton_generated")).not.toBeInTheDocument();
    expect(screen.queryByText("in_progress")).not.toBeInTheDocument();
    expect(screen.queryByText("shipped")).not.toBeInTheDocument();
  });

  it("keeps Packing filter labels aligned with badge labels", async () => {
    renderPackingPage("warehousemanager", "USR000002");

    expect(await screen.findByText("Packing")).toBeInTheDocument();
    expect(screen.getAllByText("All Statuses").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Packed")).toBeInTheDocument();
    expect(screen.getByText("Shipped")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  });
});
