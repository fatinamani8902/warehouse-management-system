import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateASN from "./CreateASN";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createAsn, lookupSkus } from "@/services/api";

vi.mock("@/services/api", () => ({
  createAsn: vi.fn(),
  lookupSkus: vi.fn(),
}));

vi.mock("@/components/selects/SupplierSelect", () => ({
  default: ({ id, value, onChange }) => (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select supplier</option>
      <option value="SUP000001">seed_supplier_name</option>
    </select>
  ),
}));

const skuOptions = [{
  sku_id: "SKU000006",
  sku_code: "TEST-BRG-001",
  description: "Test Bearing",
  uom: "EA",
}];

function renderCreateAsn(props = {}) {
  return render(
    <Dialog open>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Create ASN</DialogTitle>
        <CreateASN
          session={{ tenant_id: "TNT000001" }}
          onCreated={vi.fn()}
          onCancel={vi.fn()}
          {...props}
        />
      </DialogContent>
    </Dialog>,
  );
}

describe("CreateASN", () => {
  beforeEach(() => {
    createAsn.mockReset();
    lookupSkus.mockReset();
    lookupSkus.mockResolvedValue(skuOptions);
  });

  it("shows friendly required-field validation without submitting", () => {
    renderCreateAsn();

    fireEvent.click(screen.getByRole("button", { name: "Create ASN" }));

    expect(screen.getByText("Supplier is required")).toBeInTheDocument();
    expect(screen.getByText("Add at least one SKU line")).toBeInTheDocument();
    expect(createAsn).not.toHaveBeenCalled();
  });

  it("submits the selected supplier and SKU line", async () => {
    const onCreated = vi.fn();
    createAsn.mockResolvedValue({
      data: {
        asn_id: "ASN999999",
        supplier_id: "SUP000001",
        supplier_name: "seed_supplier_name",
        created_by: "USR000001",
      },
    });

    renderCreateAsn({ onCreated });

    fireEvent.change(screen.getByLabelText("Supplier *"), { target: { value: "SUP000001" } });
    fireEvent.click(screen.getByRole("button", { name: "Search active SKU..." }));
    const option = await screen.findByRole("option", { name: /TEST-BRG-001 - Test Bearing/ });
    expect(option.closest('[role="dialog"]')).toBeInTheDocument();
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(screen.getByRole("button", { name: /TEST-BRG-001 - Test Bearing/ })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Create ASN" }));

    await waitFor(() => expect(createAsn).toHaveBeenCalledOnce());
    expect(createAsn.mock.calls[0][1]).toMatchObject({
      supplier_id: "SUP000001",
      lines: [{ sku_id: "SKU000006", expected_qty: 4 }],
      lines_count: 1,
    });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({
      supplier_name: "seed_supplier_name",
      created_by: "USR000001",
    }));
  });

  it("selects a SKU with the keyboard and populates the ASN line", async () => {
    renderCreateAsn();

    const trigger = screen.getByRole("button", { name: "Search active SKU..." });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const search = await screen.findByLabelText("Search SKUs");
    await screen.findByRole("option", { name: /TEST-BRG-001 - Test Bearing/ });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getByRole("button", { name: /TEST-BRG-001 - Test Bearing/ })).toBeInTheDocument();
  });
});
