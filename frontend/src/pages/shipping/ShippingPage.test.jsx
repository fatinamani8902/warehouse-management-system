import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShippingPage from "./ShippingPage";
import { useAuth } from "@/contexts/AuthContext";
import {
  cancelShipment,
  closeShipment,
  dispatchShipment,
  fetchShipments,
} from "@/services/api";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: () => ({ search: "" }),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  cancelShipment: vi.fn(),
  closeShipment: vi.fn(),
  dispatchShipment: vi.fn(),
  fetchShipments: vi.fn(),
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

const baseShipment = {
  shipment_id: "SHI_TEST_001",
  order_id: "SAL_TEST_001",
  customer_name: "BuildRight Co",
  carrier: "",
  tracking_no: "",
  dispatched_by_name: "",
  status: "packed",
  created_at: "2026-07-16T08:00:00Z",
  required_ship_by: "2026-07-20",
  dispatched_at: null,
  pack_ids: ["PAC_TEST_001"],
  items: [
    {
      sku_id: "SKU000006",
      sku_name: "Test Bearing",
      location_id: "LOC000002",
      location_code: "WH000001-B-01-001-L01-B001",
      qty: 1,
      pack_id: "PAC_TEST_001",
    },
  ],
};

function makeShipment(shipment_id, status) {
  return { ...baseShipment, shipment_id, status };
}

function renderShippingPage(rows = [baseShipment]) {
  useAuth.mockReturnValue({
    currentTenantId: "TNT000001",
    currentWarehouseId: "WH000001",
    currentUser: {
      user_id: "USR000002",
      role: "warehousemanager",
    },
  });
  fetchShipments.mockResolvedValue({
    data: rows,
    total: rows.length,
    summary: {
      pending: 2,
      packed: 2,
      dispatched: 1,
      closed: 1,
      cancelled: 1,
    },
  });
  dispatchShipment.mockResolvedValue({ data: baseShipment });
  closeShipment.mockResolvedValue({ data: baseShipment });
  cancelShipment.mockResolvedValue({ data: baseShipment });

  return render(<ShippingPage />);
}

describe("ShippingPage status terminology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses Shipping-specific labels for active and compatibility statuses", async () => {
    const rows = [
      makeShipment("SHI_PLANNED", "planned"),
      makeShipment("SHI_PENDING", "pending"),
      makeShipment("SHI_PACKED", "packed"),
      makeShipment("SHI_CARTON", "carton_generated"),
      makeShipment("SHI_DISPATCHED", "dispatched"),
      makeShipment("SHI_CLOSED", "closed"),
      makeShipment("SHI_CANCELLED", "cancelled"),
    ];

    renderShippingPage(rows);

    expect(await screen.findByText("SHI_PLANNED")).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Ready to Dispatch").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Dispatched").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Closed").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Packed")).not.toBeInTheDocument();
    expect(screen.queryByText("carton_generated")).not.toBeInTheDocument();
    expect(screen.queryByText("packed")).not.toBeInTheDocument();
  });

  it("uses the same status label in the detail header badge", async () => {
    renderShippingPage([makeShipment("SHI_PACKED", "packed")]);

    fireEvent.click(await screen.findByText("SHI_PACKED"));

    expect(screen.getAllByText("Ready to Dispatch").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Packed")).not.toBeInTheDocument();
  });

  it("keeps Shipping filter labels aligned with badge labels", async () => {
    renderShippingPage();

    expect(await screen.findByText("Shipping")).toBeInTheDocument();
    expect(screen.getAllByText("All Statuses").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Ready to Dispatch").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Dispatched").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Closed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Packed")).not.toBeInTheDocument();
  });

  it("renders Shipping item location with the same ID and full code format as Picking", async () => {
    renderShippingPage([baseShipment]);

    fireEvent.click(await screen.findByText("SHI_TEST_001"));

    expect(screen.getByText("LOC000002")).toBeInTheDocument();
    expect(screen.getByText("WH000001-B-01-001-L01-B001")).toBeInTheDocument();
  });

  it("shows Required Ship By in shipment detail", async () => {
    renderShippingPage([baseShipment]);

    fireEvent.click(await screen.findByText("SHI_TEST_001"));

    expect(screen.getByText("Required Ship By")).toBeInTheDocument();
    expect(screen.getByText("20/07/2026")).toBeInTheDocument();
  });

  it("renders empty Required Ship By as dash and does not mark overdue", async () => {
    renderShippingPage([{ ...baseShipment, required_ship_by: null, ship_by: null, dispatch_due_at: null }]);

    fireEvent.click(await screen.findByText("SHI_TEST_001"));

    expect(screen.getByText("Required Ship By")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("shows Overdue badge only for non-terminal shipments past Required Ship By", async () => {
    renderShippingPage([
      { ...baseShipment, shipment_id: "SHI_OVERDUE", status: "dispatched", required_ship_by: "2026-01-01" },
      { ...baseShipment, shipment_id: "SHI_CLOSED", status: "closed", required_ship_by: "2026-01-01" },
      { ...baseShipment, shipment_id: "SHI_CANCELLED", status: "cancelled", required_ship_by: "2026-01-01" },
    ]);

    fireEvent.click(await screen.findByText("SHI_OVERDUE"));
    expect(screen.getByText("Overdue")).toBeInTheDocument();

    fireEvent.click(screen.getByText("SHI_CLOSED"));
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("SHI_CANCELLED"));
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
  });
});
