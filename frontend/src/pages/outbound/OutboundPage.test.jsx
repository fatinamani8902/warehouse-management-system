import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutboundPage from "./OutboundPage";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrders } from "@/services/api";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  fetchOrders: vi.fn(),
  releaseOrder: vi.fn(),
  addOrderLine: vi.fn(),
  cancelOrder: vi.fn(),
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

vi.mock("@/components/shared/WorkflowStepper", () => ({
  WorkflowStepper: () => <div>Workflow Stepper</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props) => <textarea {...props} />,
}));

vi.mock("@/components/shared/SkuCombobox", () => ({
  default: () => <div>SKU Combobox</div>,
}));

function renderOutboundPage(roleId) {
  useAuth.mockReturnValue({
    currentTenantId: "TNT000001",
    currentWarehouseId: "WH000001",
    currentUser: {
      user_id: "USR_TEST",
      role_id: roleId,
    },
  });
  fetchOrders.mockResolvedValue({ data: [] });

  return render(<OutboundPage />);
}

describe("OutboundPage create order visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides Create Order for unauthorized manager role", async () => {
    renderOutboundPage("warehousemanager");

    expect(await screen.findByText("Outbound Orders")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /\+ create order/i })).not.toBeInTheDocument();
  });

  it("shows Create Order for authorized role", async () => {
    renderOutboundPage("hqadmin");

    expect(await screen.findByText("Outbound Orders")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ create order/i })).toBeInTheDocument();
  });

  it("shows Required Ship By in outbound detail", async () => {
    useAuth.mockReturnValue({
      currentTenantId: "TNT000001",
      currentWarehouseId: "WH000001",
      currentUser: {
        user_id: "USR_TEST",
        role_id: "hqadmin",
      },
    });
    fetchOrders.mockResolvedValue({
      data: [{
        order_id: "SO_TEST_001",
        customer_name: "BuildRight Co",
        status: "draft",
        created_at: "2026-07-16T08:00:00Z",
        required_ship_by: "2026-07-31",
        lines_count: 0,
        lines: [],
      }],
    });

    render(<OutboundPage />);

    expect((await screen.findAllByText("SO_TEST_001")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Required Ship By")).toBeInTheDocument();
    expect(screen.getByText("31/07/2026")).toBeInTheDocument();
  });

  it("renders empty Required Ship By as dash", async () => {
    useAuth.mockReturnValue({
      currentTenantId: "TNT000001",
      currentWarehouseId: "WH000001",
      currentUser: {
        user_id: "USR_TEST",
        role_id: "hqadmin",
      },
    });
    fetchOrders.mockResolvedValue({
      data: [{
        order_id: "SO_TEST_EMPTY",
        customer_name: "BuildRight Co",
        status: "draft",
        created_at: "2026-07-16T08:00:00Z",
        required_ship_by: null,
        lines_count: 0,
        lines: [],
      }],
    });

    render(<OutboundPage />);

    expect((await screen.findAllByText("SO_TEST_EMPTY")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Required Ship By")).toBeInTheDocument();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  });
});
