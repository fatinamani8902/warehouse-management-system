import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateGRN from "./CreateGRN";

const fetchEligibleGrnAsns = vi.fn();
const createGrn = vi.fn();

vi.mock("@/services/api", () => ({
  createGrn: (...args) => createGrn(...args),
  fetchEligibleGrnAsns: (...args) => fetchEligibleGrnAsns(...args),
}));

vi.mock("@/components/selects/SupplierSelect", () => ({
  default: ({ value, disabled }) => (
    <input aria-label="Supplier" value={value} disabled={disabled} readOnly />
  ),
}));

const session = {
  tenant_id: "TNT000001",
  warehouse_id: "WH000001",
  user_id: "USR000001",
  role_id: "storemanager",
};

describe("CreateGRN", () => {
  beforeEach(() => {
    fetchEligibleGrnAsns.mockReset();
    createGrn.mockReset();
  });

  it("shows only eligible ASN options and enables create after selection", async () => {
    fetchEligibleGrnAsns.mockResolvedValue([
      {
        asn_id: "ASN000029",
        supplier_id: "SUP000001",
        status: "arrived",
      },
    ]);

    render(<CreateGRN session={session} onCreated={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole("option", { name: "ASN000029 - arrived" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /ASN000028/ })).not.toBeInTheDocument();

    const createButton = screen.getByRole("button", { name: "Create GRN" });
    expect(createButton).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ASN000029" } });
    await waitFor(() => expect(createButton).toBeEnabled());
  });

  it("shows an empty state and keeps create disabled when no ASN is eligible", async () => {
    fetchEligibleGrnAsns.mockResolvedValue([]);

    render(<CreateGRN session={session} onCreated={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText("No arrived ASN available for GRN creation.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create GRN" })).toBeDisabled();
  });
});
