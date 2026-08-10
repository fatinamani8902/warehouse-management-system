import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";
import { useAuth } from "@/contexts/AuthContext";
import { fetchDashboardSummary } from "@/services/api";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  fetchDashboardSummary: vi.fn(),
  toSessionContext: vi.fn((auth) => ({
    tenant_id: auth?.currentTenantId || "TNT000001",
    warehouse_id: auth?.currentWarehouseId || "WH000001",
    user_id: auth?.currentUser?.user_id || "",
    role_id: auth?.currentUser?.role_id || "",
    token: auth?.currentToken || null,
  })),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }) => <div>{children}</div>,
}));

vi.mock("@/components/shared/Breadcrumbs", () => ({
  Breadcrumbs: () => <div>Breadcrumbs</div>,
}));

const baseSummary = {
  data: {
    generated_at: "2026-07-21T01:00:00.000Z",
    tenant_id: "TNT000001",
    warehouse_id: "WH000001",
    kpis: {
      today_inbound: { asn_created_today: 1, grn_created_today: 2, total: 3 },
      pending_putaway: { pending: 1, assigned: 1, in_progress: 1, exception: 1, total: 4 },
      inventory: { on_hand: 293, reserved: 21, available: 272, quarantine: 0 },
      picking: { open: 1, assigned: 0, in_progress: 0, active: 1, picked: 12 },
      shipping: { ready_to_dispatch: 1, dispatched: 1, closed: 3, overdue: 1 },
      approvals: { cycle_counts_submitted: 1, adjustments_submitted: 4, total: 5 },
      returns: {
        return_created: 1,
        rma_processing: 2,
        total_pending: 3,
        open_returns: 3,
        active_rmas: 2,
        returns_awaiting_closure: 1,
      },
      operational: {
        pending_inbound: 4,
        receiving_in_progress: 2,
        pending_putaway: 4,
        active_picking: 1,
        pending_packing: 3,
        shipments_ready_or_in_progress: 2,
        open_returns: 3,
        active_rmas: 2,
      },
    },
    status_summary: {
      inbound: { pending_asn: 2, in_transit_asn: 1, arrived_asn: 1, receiving_grn: 2, completed_posted_grn: 4 },
      warehouse: { active_putaway: 4, active_picking: 1, active_packing: 3 },
      outbound: { ready_to_dispatch: 1, dispatched: 1, closed: 3 },
      inventory: { submitted_cycle_counts: 1, submitted_adjustments: 4 },
    },
    pending_actions: [],
    recent_transactions: [],
    trends: {
      labels: ["Wed 15", "Thu 16"],
      inbound: [1, 2],
      outbound: [2, 1],
    },
  },
};

let authState;

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

function sourceText() {
  const __filename = fileURLToPath(import.meta.url);
  return fs.readFileSync(path.resolve(path.dirname(__filename), "Dashboard.jsx"), "utf8");
}

describe("Dashboard control tower", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockClear();
    authState = {
      currentTenantId: "TNT000001",
      currentWarehouseId: "WH000001",
      currentUser: {
        user_id: "USR000002",
        role_id: "warehousemanager",
      },
    };
    useAuth.mockImplementation(() => authState);
    fetchDashboardSummary.mockResolvedValue(baseSummary);
  });

  it("does not import Dashboard mock data", async () => {
    renderDashboard();
    const source = sourceText();

    expect(source).not.toMatch(/dashboardKPIs/);
    expect(source).not.toMatch(/chartData/);
    expect(source).not.toMatch(/recentActivities/);
    expect(source).not.toMatch(/floorStatus/);
    expect(source).not.toContain("from \"@/data/mockData\"");
    expect(await screen.findByText("Today’s Operations")).toBeInTheDocument();
  });

  it("renders only Today’s Operations and Need Attention sections", async () => {
    renderDashboard();

    expect(await screen.findByText("Today’s Operations")).toBeInTheDocument();
    expect(screen.getByText("Need Attention")).toBeInTheDocument();
    expect(screen.queryByText("Today’s Work Queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending Actions")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("7-Day Inbound vs Outbound Trend")).not.toBeInTheDocument();
    expect(screen.queryByText("Operational Status Summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Inventory Snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Exception & Attention Summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick Navigation")).not.toBeInTheDocument();
  });

  it("renders exactly five operation cards with active workload counts", async () => {
    renderDashboard();

    expect(await screen.findByRole("button", { name: /Inbound: 6/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Storage: 4/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fulfilment: 4/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Outbound: 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Returns: 3/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Inbound:|Storage:|Fulfilment:|Outbound:|Returns:/i })).toHaveLength(5);
  });

  it("uses active status breakdowns for operation cards", async () => {
    renderDashboard();

    expect(await screen.findByText("Pending 2 · In Transit 1 · Awaiting Receiving 1 · Receiving 2")).toBeInTheDocument();
    expect(screen.getByText("Active Putaway 4")).toBeInTheDocument();
    expect(screen.getByText("Picking 1 · Packing 3")).toBeInTheDocument();
    expect(screen.getByText("Ready 1 · Dispatched 1")).toBeInTheDocument();
    expect(screen.getByText("Awaiting RMA 1 · RMA Follow-up 2")).toBeInTheDocument();
  });

  it("navigates operation cards and opens custom fulfilment selector", async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Inbound: 6/i }));
    expect(navigateMock).toHaveBeenCalledWith("/inbound");

    fireEvent.click(screen.getByRole("button", { name: /Storage: 4/i }));
    expect(navigateMock).toHaveBeenCalledWith("/putaway");

    fireEvent.click(screen.getByRole("button", { name: /Outbound: 2/i }));
    expect(navigateMock).toHaveBeenCalledWith("/shipping?status=packed");

    fireEvent.click(screen.getByRole("button", { name: /Returns: 3/i }));
    expect(navigateMock).toHaveBeenCalledWith("/returns");

    fireEvent.click(screen.getByRole("button", { name: /Fulfilment: 4/i }));
    expect(screen.getByRole("dialog", { name: "View Fulfilment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Picking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Packing" })).toBeInTheDocument();
  });

  it("fulfilment selector navigates to picking and packing and supports Escape", async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /Fulfilment: 4/i }));
    fireEvent.click(screen.getByRole("button", { name: "View Picking" }));
    expect(navigateMock).toHaveBeenCalledWith("/picking");

    fireEvent.click(screen.getByRole("button", { name: /Fulfilment: 4/i }));
    fireEvent.click(screen.getByRole("button", { name: "View Packing" }));
    expect(navigateMock).toHaveBeenCalledWith("/packing");

    fireEvent.click(screen.getByRole("button", { name: /Fulfilment: 4/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "View Fulfilment" })).not.toBeInTheDocument();
  });

  it("shows only non-zero Need Attention rows", async () => {
    renderDashboard();

    expect(await screen.findByText("Overdue Shipments")).toBeInTheDocument();
    expect(screen.getByText("Putaway Exceptions")).toBeInTheDocument();
    expect(screen.getByText("Cycle Counts Awaiting Review")).toBeInTheDocument();
    expect(screen.getByText("Adjustments Awaiting Approval")).toBeInTheDocument();
    expect(screen.getByText("Returns Awaiting Closure")).toBeInTheDocument();
    expect(screen.queryByText("No operational issues requiring attention.")).not.toBeInTheDocument();
  });

  it("navigates Need Attention rows", async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Overdue Shipments: 1" }));
    expect(navigateMock).toHaveBeenCalledWith("/shipping");
    fireEvent.click(screen.getByRole("button", { name: "Putaway Exceptions: 1" }));
    expect(navigateMock).toHaveBeenCalledWith("/putaway?status=exception");
    fireEvent.click(screen.getByRole("button", { name: "Cycle Counts Awaiting Review: 1" }));
    expect(navigateMock).toHaveBeenCalledWith("/inventory?view=cycle-count");
    fireEvent.click(screen.getByRole("button", { name: "Adjustments Awaiting Approval: 4" }));
    expect(navigateMock).toHaveBeenCalledWith("/inventory?view=adjustments");
    fireEvent.click(screen.getByRole("button", { name: "Returns Awaiting Closure: 1" }));
    expect(navigateMock).toHaveBeenCalledWith("/returns");
  });

  it("renders compact no-attention success state when all issue counts are zero", async () => {
    fetchDashboardSummary.mockResolvedValueOnce({
      data: {
        ...baseSummary.data,
        kpis: {
          ...baseSummary.data.kpis,
          pending_putaway: { pending: 0, assigned: 0, in_progress: 0, exception: 0, total: 0 },
          shipping: { ready_to_dispatch: 0, dispatched: 0, closed: 0, overdue: 0 },
          approvals: { cycle_counts_submitted: 0, adjustments_submitted: 0, total: 0 },
          returns: { return_created: 0, rma_processing: 0, total_pending: 0, open_returns: 0, active_rmas: 0, returns_awaiting_closure: 0 },
        },
        status_summary: {
          ...baseSummary.data.status_summary,
          warehouse: { active_putaway: 0, active_picking: 0, active_packing: 0 },
        },
      },
    });

    renderDashboard();

    expect(await screen.findByText("No operational issues requiring attention.")).toBeInTheDocument();
    expect(screen.queryByText("Overdue Shipments")).not.toBeInTheDocument();
  });

  it("refreshes when selected warehouse changes", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(fetchDashboardSummary).toHaveBeenCalledTimes(1));
    authState = {
      ...authState,
      currentWarehouseId: "WH000002",
      currentUser: { ...authState.currentUser },
    };
    rerender(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(fetchDashboardSummary).toHaveBeenCalledTimes(2));
    expect(fetchDashboardSummary.mock.calls[1][0]).toEqual(expect.objectContaining({ warehouse_id: "WH000002" }));
  });

  it("shows loading state without false zero values", () => {
    fetchDashboardSummary.mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(screen.getByText("Loading dashboard summary...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refreshing/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Inbound: 0/i })).not.toBeInTheDocument();
  });

  it("shows error state and retry", async () => {
    fetchDashboardSummary.mockRejectedValueOnce(new Error("Warehouse access denied"));
    fetchDashboardSummary.mockResolvedValueOnce(baseSummary);

    renderDashboard();

    expect(await screen.findByText("Warehouse access denied")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Today’s Operations")).toBeInTheDocument();
    expect(fetchDashboardSummary).toHaveBeenCalledTimes(2);
  });

  it("refresh button reloads data and keeps generated timestamp visible", async () => {
    renderDashboard();

    expect(await screen.findByText("Today’s Operations")).toBeInTheDocument();
    expect(screen.getByText(/Last refreshed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => expect(fetchDashboardSummary).toHaveBeenCalledTimes(2));
  });

  it("renders zero operation counts as 0", async () => {
    fetchDashboardSummary.mockResolvedValueOnce({
      data: {
        ...baseSummary.data,
        kpis: {
          ...baseSummary.data.kpis,
          pending_putaway: { pending: 0, assigned: 0, in_progress: 0, exception: 0, total: 0 },
          picking: { open: 0, assigned: 0, in_progress: 0, active: 0, picked: 0 },
          shipping: { ready_to_dispatch: 0, dispatched: 0, closed: 0, overdue: 0 },
          returns: { return_created: 0, rma_processing: 0, total_pending: 0, open_returns: 0, active_rmas: 0, returns_awaiting_closure: 0 },
        },
        status_summary: {
          inbound: { pending_asn: 0, in_transit_asn: 0, arrived_asn: 0, receiving_grn: 0, completed_posted_grn: 0 },
          warehouse: { active_putaway: 0, active_picking: 0, active_packing: 0 },
          outbound: { ready_to_dispatch: 0, dispatched: 0, closed: 0 },
          inventory: { submitted_cycle_counts: 0, submitted_adjustments: 0 },
        },
      },
    });

    renderDashboard();

    expect(await screen.findByRole("button", { name: /Inbound: 0/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Storage: 0/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fulfilment: 0/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Outbound: 0/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Returns: 0/i })).toBeInTheDocument();
  });

  it("does not display RMA created as Created in Dashboard UI", async () => {
    renderDashboard();

    await screen.findByText("Today’s Operations");
    expect(screen.queryByText("Created")).not.toBeInTheDocument();
    expect(sourceText()).toContain("RMA Follow-up");
    expect(sourceText()).not.toContain("Recent Activity");
  });

  it("uses a responsive five-card operation grid", async () => {
    renderDashboard();

    await screen.findByText("Today’s Operations");
    expect(sourceText()).toContain('gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))"');
  });
});
