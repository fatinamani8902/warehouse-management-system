import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "./InventoryPage";
import { useAuth } from "@/contexts/AuthContext";

let routeSearch = "?view=cycle";
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: () => ({ search: routeSearch }),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/Breadcrumbs", () => ({
  Breadcrumbs: () => <div>Breadcrumbs</div>,
}));

vi.mock("@/components/shared/GlossaryTooltip", () => ({
  GlossaryRegistry: ({ children }) => <>{children}</>,
  GlossaryTerm: ({ term }) => <>{term}</>,
}));

vi.mock("@/components/shared/SkuCombobox", () => ({
  default: ({ onChange }) => <button type="button" data-testid="sku-combobox" onClick={() => onChange?.("SKU000006")}>Select SKU000006</button>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }) => <div>{children}</div>,
  TabsContent: ({ children }) => <div>{children}</div>,
  TabsList: ({ children }) => <div>{children}</div>,
  TabsTrigger: ({ children }) => <button>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props) => <textarea {...props} />,
}));

vi.mock("@/components/modals/CancellationConfirmModal", () => ({
  CancellationConfirmModal: () => null,
}));

vi.mock("@/components/shared/ConfirmModal", () => ({
  ConfirmModal: () => null,
}));

vi.mock("@/services/api", () => ({
  addCountPlanEntry: vi.fn(),
  assignCountPlan: vi.fn(),
  approveAdjustmentRequest: vi.fn(),
  approveCountPlan: vi.fn(),
  cancelAdjustmentRequest: vi.fn(),
  cancelCountPlan: vi.fn(),
  createAdjustmentRequest: vi.fn(),
  createCountPlan: vi.fn(),
  fetchAdjustmentLocations: vi.fn(),
  fetchAdjustmentRequests: vi.fn(),
  fetchCountPlanById: vi.fn(),
  fetchCountPlanOperators: vi.fn(),
  fetchCountPlans: vi.fn(),
  fetchInventoryBalances: vi.fn(),
  fetchInventoryOptions: vi.fn(),
  lookupLocations: vi.fn(),
  rejectAdjustmentRequest: vi.fn(),
  rejectCountPlan: vi.fn(),
  startCountPlan: vi.fn(),
  submitAdjustmentRequest: vi.fn(),
  submitCountPlan: vi.fn(),
  toSessionContext: vi.fn((auth) => ({
    tenant_id: auth?.currentTenantId || "TNT000001",
    warehouse_id: auth?.currentWarehouseId || "WH000001",
    user_id: auth?.currentUser?.user_id || "",
    role_id: auth?.currentUser?.role_id || auth?.currentUser?.role || "",
    token: null,
  })),
  updateCountPlan: vi.fn(),
}));

import {
  fetchAdjustmentLocations,
  fetchAdjustmentRequests,
  fetchCountPlanById,
  fetchCountPlanOperators,
  fetchCountPlans,
  fetchInventoryBalances,
  fetchInventoryOptions,
  lookupLocations,
} from "@/services/api";

const submittedCount = {
  count_id: "CCN_TEST_001",
  cc_id: "CCN_TEST_001",
  status: "SUBMITTED",
  zone_id: "ZON000001",
  zone_name: "Zone A",
  planned_date: "2026-07-20",
  created_by: "USR000005",
  submitted_by: "USR000015",
  submitted_at: "2026-07-20T08:00:00Z",
  lines: [
    {
      line_id: "CCL_TEST_001",
      sku_id: "SKU000006",
      sku_description: "Test Bearing",
      location_id: "LOC000002",
      location_code: "WH000001-B-01-001-L01-B001",
      system_qty: 1,
      counted_qty: 1,
    },
  ],
};

const draftCount = {
  ...submittedCount,
  count_id: "CCN_TEST_DRAFT",
  cc_id: "CCN_TEST_DRAFT",
  status: "DRAFT",
  submitted_by: null,
  submitted_at: null,
};

const submittedAdjustment = {
  adj_id: "ADJ_TEST_001",
  status: "SUBMITTED",
  sku_id: "SKU000006",
  location_id: "LOC000002",
  qty_delta: 1,
  requested_by: "USR000005",
  requested_at: "2026-07-20T08:00:00Z",
  created_at: "2026-07-20T08:00:00Z",
};

function mockAuth(roleId, userId = "USR000002") {
  useAuth.mockReturnValue({
    currentTenantId: "TNT000001",
    currentWarehouseId: "WH000001",
    currentUser: {
      user_id: userId,
      role_id: roleId,
      role: roleId,
    },
  });
}

function mockCommonApi({ count = submittedCount, adjustment = submittedAdjustment } = {}) {
  fetchInventoryOptions.mockResolvedValue({
    warehouses: [],
    zones: [{ zone_id: "ZON000001", zone_name: "Zone A", status: "active", warehouse_id: "WH000001" }],
    reason_codes: [],
    count_config: {},
  });
  lookupLocations.mockResolvedValue([]);
  fetchAdjustmentLocations.mockResolvedValue({ data: [] });
  fetchInventoryBalances.mockResolvedValue({ data: [], total: 0 });
  fetchCountPlans.mockResolvedValue({ items: [count], total: 1 });
  fetchCountPlanById.mockResolvedValue(count);
  fetchCountPlanOperators.mockResolvedValue({ items: [] });
  fetchAdjustmentRequests.mockResolvedValue({ items: [adjustment], total: 1 });
}

async function openCycleCountDetail(countId = "CCN_TEST_001") {
  expect(await screen.findByText(countId)).toBeInTheDocument();
  fireEvent.click(screen.getByText(countId));
  await waitFor(() => expect(fetchCountPlanById).toHaveBeenCalledWith(expect.anything(), countId));
  expect(await screen.findByText("Count Entry Lines")).toBeInTheDocument();
}

async function renderCycle(roleId, userId = "USR000002", count = submittedCount) {
  routeSearch = "?view=cycle";
  mockAuth(roleId, userId);
  mockCommonApi({ count });
  render(<InventoryPage />);
  await openCycleCountDetail(count.count_id);
}

describe("InventoryPage Cycle Count approval visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeSearch = "?view=cycle";
    window.alert = vi.fn();
    window.confirm = vi.fn();
  });

  it.each(["warehousemanager", "superadmin", "manager"])(
    "shows Approve and Reject for %s on a submitted count when maker-checker allows it",
    async (roleId) => {
      await renderCycle(roleId);

      expect(screen.getByRole("button", { name: /^Approve$/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Reject$/ })).toBeInTheDocument();
    },
  );

  it("does not grant Cycle Count approval to storemanager", async () => {
    await renderCycle("storemanager");

    expect(screen.queryByRole("button", { name: /^Approve$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reject$/ })).not.toBeInTheDocument();
    expect(screen.getByText("This cycle count has been submitted and is awaiting Warehouse Manager approval.")).toBeInTheDocument();
  });

  it("does not render approval buttons for non-submitted counts", async () => {
    await renderCycle("warehousemanager", "USR000002", draftCount);

    expect(screen.queryByRole("button", { name: /^Approve$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reject$/ })).not.toBeInTheDocument();
  });

  it("keeps maker-checker blocking for the count creator or submitter", async () => {
    await renderCycle("warehousemanager", "USR000005");

    expect(screen.queryByRole("button", { name: /^Approve$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reject$/ })).not.toBeInTheDocument();
    expect(screen.getByText("You cannot approve or reject this count because you created or submitted it.")).toBeInTheDocument();
  });

  it("uses the custom rejection modal and requires a reason", async () => {
    await renderCycle("warehousemanager");

    fireEvent.click(screen.getByRole("button", { name: /^Reject$/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Reject Count Plan")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter reason (min. 5 characters)")).toBeInTheDocument();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });
});

describe("InventoryPage Adjustment permission preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeSearch = "?view=adjustments";
  });

  it("keeps warehousemanager mapped to the existing Adjustment approval role", async () => {
    mockAuth("warehousemanager", "USR000002");
    mockCommonApi();
    render(<InventoryPage />);

    expect(await screen.findByText("ADJ_TEST_001")).toBeInTheDocument();
    fireEvent.click(screen.getByText("ADJ_TEST_001"));

    expect(screen.getByRole("button", { name: /^Approve$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Reject$/ })).toBeInTheDocument();
  });
});

describe("InventoryPage Adjustment location selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeSearch = "?view=adjustments";
  });

  it("loads SKU-specific adjustment locations with stock context", async () => {
    mockAuth("storeoperator", "USR000015");
    mockCommonApi();
    fetchAdjustmentLocations.mockResolvedValue({
      data: [
        {
          location_id: "LOC000002",
          display_name: "WH000001-B-01-001-L01-B001",
          location_code: "seed_label",
          location_type: "storage",
          on_hand_qty: 10,
          available_qty: 8,
          reserved_qty: 2,
        },
      ],
    });

    render(<InventoryPage />);

    expect(await screen.findByText("ADJ_TEST_001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ New Adjustment" }));
    fireEvent.click(screen.getByTestId("sku-combobox"));

    await waitFor(() => {
      expect(fetchAdjustmentLocations).toHaveBeenCalledWith(
        expect.anything(),
        { sku_id: "SKU000006" },
      );
    });

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("WH000001-B-01-001-L01-B001")).toBeInTheDocument();
    expect(within(dialog).getByText("On Hand: 10 · Available: 8 · Reserved: 2")).toBeInTheDocument();
    expect(within(dialog).queryByText("seed_label")).not.toBeInTheDocument();
  });

  it("does not use the general location list for new adjustments", async () => {
    mockAuth("storeoperator", "USR000015");
    mockCommonApi();
    lookupLocations.mockResolvedValue([
      {
        location_id: "LOC_RECEIVING",
        display_name: "Receiving Dock",
        location_code: "RECEIVING",
        location_type: "receiving",
      },
    ]);
    fetchAdjustmentLocations.mockResolvedValue({ data: [] });

    render(<InventoryPage />);

    expect(await screen.findByText("ADJ_TEST_001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ New Adjustment" }));
    fireEvent.click(screen.getByTestId("sku-combobox"));

    await waitFor(() => expect(fetchAdjustmentLocations).toHaveBeenCalled());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Receiving Dock")).not.toBeInTheDocument();
    expect(within(dialog).getByText("No active adjustment locations are available for this SKU in the selected warehouse.")).toBeInTheDocument();
  });
});
