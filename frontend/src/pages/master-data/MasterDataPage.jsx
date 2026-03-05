import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { customers, locations, skus, warehouses } from "@/data/mockData";
import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  toSessionContext,
  updateSupplier,
} from "@/services/api";

const MasterDataPage = () => {
  const auth = useAuth();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);

  const [supplierRows, setSupplierRows] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierError, setSupplierError] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({
    supplier_id: "",
    supplier_name: "",
    is_active: true,
  });
  const [formError, setFormError] = useState("");

const loadSuppliers = useCallback(async () => {
  if (!session?.tenant_id) return;

  try {
    setSupplierLoading(true);
    setSupplierError("");

    const suppliers = await fetchSuppliers(session);

    console.log("GET suppliers:", suppliers);

    setSupplierRows(Array.isArray(suppliers) ? suppliers : []);
  } catch (error) {
    setSupplierError(error.message || "Failed to load suppliers");
  } finally {
    setSupplierLoading(false);
  }
}, [session]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const resetForm = () => {
    setForm({ supplier_id: "", supplier_name: "", is_active: true });
    setFormError("");
  };

const handleSaveSupplier = async () => {
  if (!form.supplier_name.trim()) {
    setFormError("Supplier name is required");
    return;
  }

  try {
    setSavingSupplier(true);
    setFormError("");

    if (form.supplier_id) {
      const updated = await updateSupplier(session, form.supplier_id, {
        supplier_name: form.supplier_name.trim(),
        is_active: form.is_active,
      });

      setSupplierRows((current) =>
        current.map((row) => (row.id === updated.id ? updated : row))
      );

      toast({
        title: "Supplier updated",
        description: `${updated.id} updated`,
      });
    } else {
      const created = await createSupplier(session, {
        supplier_name: form.supplier_name.trim(),
        is_active: form.is_active,
      });

      setSupplierRows((current) => [created, ...current]);

      toast({
        title: "Supplier created",
        description: `${created.id} created`,
      });
    }

    resetForm();
  } catch (error) {
    setFormError(error.message || "Failed to save supplier");
  } finally {
    setSavingSupplier(false);
  }
};

const handleDeleteSupplier = async () => {
  if (!deleteTarget) return;

  try {
    await deleteSupplier(session, deleteTarget.id);

    setSupplierRows((current) =>
      current.filter((row) => row.id !== deleteTarget.id)
    );

    toast({
      title: "Supplier deleted",
      description: `${deleteTarget.id} removed`,
    });

    setDeleteTarget(null);
  } catch (error) {
    toast({
      title: "Delete failed",
      description: error.message || "Unable to delete supplier",
      variant: "destructive",
    });
    setDeleteTarget(null);
  }
};

  const skuColumns = [
    { key: "id", label: "SKU ID", sortable: true },
    { key: "description", label: "Description", sortable: true },
    { key: "category", label: "Category", sortable: true },
    { key: "uom", label: "UOM" },
    { key: "lot", label: "Lot", render: (record) => record.lot || "-" },
    { key: "hazardous", label: "Hazardous", render: (record) => (record.hazardous ? "Yes" : "No") },
    { key: "status", label: "Status", render: (record) => <StatusBadge status={record.status} /> },
  ];

  const locationColumns = [
    { key: "id", label: "Location ID", sortable: true },
    { key: "label", label: "Label" },
    { key: "zone", label: "Zone" },
    { key: "aisle", label: "Aisle" },
    { key: "rack", label: "Rack" },
    { key: "bin", label: "Bin" },
  ];

const supplierColumns = [
  { key: "id", label: "Supplier ID", sortable: true },
  { key: "supplier_name", label: "Supplier Name", sortable: true },
  {
    key: "is_active",
    label: "Status",
    render: (record) => (
      <StatusBadge status={record.is_active ? "active" : "inactive"} />
    ),
  },
  {
    key: "actions",
    label: "Actions",
    render: (record) => (
      <div
        className="flex gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => {
            setForm({
              supplier_id: record.id,
              supplier_name: record.supplier_name,
              is_active: record.is_active,
            });
            setFormError("");
          }}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-[11px]"
          onClick={() => setDeleteTarget(record)}
        >
          Delete
        </Button>
      </div>
    ),
  },
];

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Master Data" }]} />
      <h1 className="text-2xl font-bold mb-4">Master Data</h1>

      <Tabs defaultValue="sku">
        <TabsList>
          <TabsTrigger value="sku">SKU Master</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="sku" className="mt-4">
          <DataTable columns={skuColumns} data={skus} actions={<Button size="sm">Add SKU</Button>} />
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <DataTable columns={locationColumns} data={locations} actions={<Button size="sm">Add Location</Button>} />
        </TabsContent>

        <TabsContent value="warehouses" className="mt-4">
          <DataTable
            columns={[
              { key: "id", label: "ID" },
              { key: "name", label: "Name" },
              { key: "city", label: "City" },
              { key: "country", label: "Country" },
            ]}
            data={warehouses}
          />
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Supplier Maintenance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label htmlFor="supplier-name">Supplier Name</Label>
                  <Input
                    id="supplier-name"
                    value={form.supplier_name}
                    onChange={(event) => setForm((current) => ({ ...current, supplier_name: event.target.value }))}
                    placeholder="Enter supplier name"
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-active">Active</Label>
                  <div className="h-10 flex items-center gap-2 border rounded px-3">
                    <input
                      id="supplier-active"
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                    />
                    <span className="text-sm">Is Active</span>
                  </div>
                </div>
              </div>

              {formError && <p className="text-xs text-destructive">{formError}</p>}
              {supplierError && <p className="text-xs text-destructive">{supplierError}</p>}

              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={loadSuppliers} disabled={supplierLoading || savingSupplier}>
                  Refresh
                </Button>
                <Button size="sm" variant="outline" onClick={resetForm} disabled={savingSupplier}>
                  Clear
                </Button>
                <Button size="sm" onClick={handleSaveSupplier} disabled={savingSupplier}>
                  {savingSupplier ? "Saving..." : form.supplier_id ? "Update Supplier" : "Add Supplier"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <DataTable
            columns={supplierColumns}
            data={supplierRows}
            searchable
            searchPlaceholder="Search suppliers..."
          />
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <DataTable
            columns={[
              { key: "id", label: "ID" },
              { key: "name", label: "Name" },
              { key: "contact", label: "Contact" },
              { key: "country", label: "Country" },
            ]}
            data={customers}
          />
        </TabsContent>
      </Tabs>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSupplier}
        title={deleteTarget ? `Delete ${deleteTarget.supplier_id}` : "Delete supplier"}
        description={
          deleteTarget
            ? `Delete supplier ${deleteTarget.supplier_id} (${deleteTarget.supplier_name})? This action cannot be undone.`
            : ""
        }
        confirmLabel="Confirm"
        cancelLabel="Back"
        variant="destructive"
      />
    </AppLayout>
  );
};

export default MasterDataPage;

