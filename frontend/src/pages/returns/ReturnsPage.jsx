import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { CancellationConfirmModal } from "@/components/modals/CancellationConfirmModal";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WorkflowStepper } from "@/components/shared/WorkflowStepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { canCreateReturn, canCancelReturn, canCreateRma } from "@/services/rbac";
import { useToast } from "@/hooks/use-toast";
import {
  cancelReturn,
  createReturn,
  createRmaFromReturn,
  fetchReturns,
  fetchRmas,
} from "@/services/api";

// transition helper — confirm or close a return
async function transitionReturnStatus(session, returnId, action) {
  const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
  const response = await fetch(`${API_BASE}/returns/${returnId}/transition`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.tenant_id || "",
      "x-user-id": session.user_id || "",
      "x-roles": session.role_id || "superadmin",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
    },
    credentials: "include",
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed ${response.status}`);
  return data;
}

// transition helper — process or complete an RMA
async function transitionRmaStatus(session, rmaId, action) {
  const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
  const response = await fetch(`${API_BASE}/rma/${rmaId}/transition`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.tenant_id || "",
      "x-user-id": session.user_id || "",
      "x-roles": session.role_id || "superadmin",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
    },
    credentials: "include",
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed ${response.status}`);
  return data;
}

// cancel RMA helper
async function cancelRmaRequest(session, rmaId, reason) {
  const API_BASE = `${import.meta.env.VITE_API_URL}/api/v1`;
  const response = await fetch(`${API_BASE}/rma/${rmaId}/cancel`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": session.tenant_id || "",
      "x-user-id": session.user_id || "",
      "x-roles": session.role_id || "superadmin",
      "x-warehouse-id": session.warehouse_id || "",
      "x-client-source": "PORTAL",
    },
    credentials: "include",
    body: JSON.stringify({ cancellation_reason: reason }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed ${response.status}`);
  return data;
}

const rmaStatusTransitions = {
  created:     { action: "process",  label: "Process",  nextStatus: "processing" },
  processing:  { action: "complete", label: "Complete", nextStatus: "completed"  },
};

function stepperForRmaStatus(status) {
  const flow = ["open", "processing", "completed"];
  if (status === "cancelled") {
    return flow.map((label, i) => ({ label, status: i === 0 ? "current" : "pending" }));
  }
  const currentIndex = flow.indexOf(status);
  // "created" and any unknown status maps to first step (open)
  if (currentIndex === -1) {
    return flow.map((label, i) => ({ label, status: i === 0 ? "current" : "pending" }));
  }
  return flow.map((label, i) => {
    if (i < currentIndex) return { label, status: "completed" };
    if (i === currentIndex) return { label, status: "current" };
    return { label, status: "pending" };
  });
}

const roleAliases = {
  superadmin: "warehousemanager",
  hqadmin: "warehousemanager",
  storemanager: "warehousemanager",
  warehouseclerk: "storekeeper",
  warehousemanager: "warehousemanager",
  storekeeper: "storekeeper",
  auditor: "auditor",
  readonly: "readonly",
};

const returnReasonOptions = [
  { value: "defective", label: "Defective" },
  { value: "wrong_item", label: "Wrong Item" },
  { value: "damaged_in_transit", label: "Damaged In Transit" },
  { value: "missing_parts", label: "Missing Parts" },
  { value: "not_as_described", label: "Not As Described" },
];

// FIX: only "created" status is cancellable — confirmed and closed are too far along
const cancellableStatuses = ["created"];

// status transitions: created → confirmed → closed
const statusTransitions = {
  created:   { action: "confirm",  label: "Confirm",  nextStatus: "confirmed" },
  confirmed: { action: "close",    label: "Close",    nextStatus: "closed"    },
};

function canTransitionStatus(status) {
  return Boolean(statusTransitions[status]);
}

const initialCreateForm = {
  shipment_id: "",
  customer_id: "",
  customer_name: "",
  sku_id: "",
  qty: "1",
  reason_code: "",
  reason_description: "",
  notes: "",
};

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

function canCancelStatus(status) {
  return cancellableStatuses.includes(status);
}

function canCreateRmaFromStatus(status) {
  return !["closed", "cancelled"].includes(status);
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function stepperForReturnStatus(status) {
  const flow = ["created", "confirmed", "closed"];
  if (status === "cancelled") {
    return flow.map((label, index) => ({
      label,
      status: index === 0 ? "current" : "pending",
    }));
  }
  const currentIndex = flow.indexOf(status);
  // unknown status maps to first step
  if (currentIndex === -1) {
    return flow.map((label, index) => ({
      label,
      status: index === 0 ? "current" : "pending",
    }));
  }
  return flow.map((label, index) => {
    if (index < currentIndex) return { label, status: "completed" };
    if (index === currentIndex) return { label, status: "current" };
    return { label, status: "pending" };
  });
}

const ReturnsPage = () => {
  const auth = useAuth();
  const { toast } = useToast();
  const tenantId = auth.currentTenantId || null;
  const warehouseId = auth.currentWarehouseId || null;
  const userId = auth.currentUser?.id || null;
  const userRole = auth.currentUser?.role || null;
  const session = useMemo(
    () => ({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      user_id: userId,
      role_id: userRole,
    }),
    [tenantId, warehouseId, userId, userRole],
  );
  const roleId = useMemo(() => normalizeRole(userRole), [userRole]);

  const canCreateReturnPermission = useMemo(
    () => ["warehousemanager", "storekeeper"].includes(roleId),
    [roleId],
  );
  const canCreateRma = useMemo(
    () => ["warehousemanager"].includes(roleId),
    [roleId],
  );
  const canCancelReturnRole = useMemo(() => roleId === "warehousemanager", [roleId]);
  const canTransitionReturn = useMemo(
    () => ["warehousemanager"].includes(roleId),
    [roleId],
  );

  const [activeTab, setActiveTab] = useState("returns");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionKey, setActionKey] = useState("");

  const [returnsData, setReturnsData] = useState([]);
  const [rmasData, setRmasData] = useState([]);

  const [selectedReturnId, setSelectedReturnId] = useState("");
  const [selectedRmaId, setSelectedRmaId] = useState("");

  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createFormErrors, setCreateFormErrors] = useState({});

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelRmaTarget, setCancelRmaTarget] = useState(null);

  const selectedReturn = useMemo(
    () => returnsData.find((row) => row.return_id === selectedReturnId) || null,
    [returnsData, selectedReturnId],
  );

  const selectedRma = useMemo(
    () => rmasData.find((row) => row.rma_id === selectedRmaId) || null,
    [rmasData, selectedRmaId],
  );

  const relatedRmasForSelectedReturn = useMemo(() => {
    if (!selectedReturn) return [];
    return rmasData.filter((row) => row.return_id === selectedReturn.return_id);
  }, [rmasData, selectedReturn]);

  // FIX: extract reason codes from linked RMA items for display in Returns detail view
  const reasonCodesForSelectedReturn = useMemo(() => {
    if (relatedRmasForSelectedReturn.length === 0) return [];
    return relatedRmasForSelectedReturn
      .flatMap((rma) => rma.items || [])
      .map((item) => item.reason_code)
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
  }, [relatedRmasForSelectedReturn]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;

    try {
      setLoading(true);
      setError("");
      const requestSession = {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        user_id: userId,
        role_id: userRole,
      };
      const [returnRows, rmaRows] = await Promise.all([
        fetchReturns(requestSession),
        fetchRmas(requestSession),
      ]);
      const normalizedReturns = Array.isArray(returnRows) ? returnRows : [];
      const normalizedRmas = Array.isArray(rmaRows) ? rmaRows : [];
      setReturnsData(normalizedReturns);
      setRmasData(normalizedRmas);

      setSelectedReturnId((current) => {
        if (current && normalizedReturns.some((row) => row.return_id === current)) return current;
        return normalizedReturns[0]?.return_id || "";
      });
      setSelectedRmaId((current) => {
        if (current && normalizedRmas.some((row) => row.rma_id === current)) return current;
        return normalizedRmas[0]?.rma_id || "";
      });
    } catch (loadError) {
      setError(loadError.message || "Failed to load returns data");
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, userId, userRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateCreateForm = (field, value) => {
    setCreateForm((current) => ({ ...current, [field]: value }));
    setCreateFormErrors((current) => ({ ...current, [field]: "" }));
  };

  const validateCreateReturnForm = () => {
    const errors = {};
    if (!createForm.shipment_id.trim()) errors.shipment_id = "Shipment ID is required";
    if (!createForm.customer_id.trim()) errors.customer_id = "Customer ID is required";
    if (!createForm.customer_name.trim()) errors.customer_name = "Customer name is required";
    if (!createForm.sku_id.trim()) errors.sku_id = "SKU ID is required";
    if (!createForm.reason_code.trim()) errors.reason_code = "Reason code is required";

    const parsedQty = Number(createForm.qty);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) errors.qty = "Quantity must be greater than 0";

    setCreateFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitCreateReturn = async () => {
    if (!validateCreateReturnForm()) return;

    try {
      setActionKey("create-return");
      setError("");

      const reason = returnReasonOptions.find((item) => item.value === createForm.reason_code);
      const created = await createReturn(session, {
        shipment_id: createForm.shipment_id.trim(),
        customer_id: createForm.customer_id.trim(),
        customer_name: createForm.customer_name.trim(),
        sku_id: createForm.sku_id.trim(),
        qty: Number(createForm.qty),
        reason_code: createForm.reason_code.trim(),
        reason_description: createForm.reason_description.trim() || reason?.label || "",
        notes: createForm.notes.trim(),
      });

      setReturnsData((current) => [created, ...current.filter((row) => row.return_id !== created.return_id)]);
      setSelectedReturnId(created.return_id);
      setShowCreateReturn(false);
      setCreateForm(initialCreateForm);
      toast({ title: "Return created", description: `Return ${created.return_id} created successfully` });
    } catch (createError) {
      const message = createError.message || "Unable to create return";
      setError(message);
      toast({ title: "Create failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const handleCreateRma = async (returnRecord) => {
    if (!returnRecord) return;

    try {
      const busyKey = `create-rma-${returnRecord.return_id}`;
      setActionKey(busyKey);
      setError("");

      const created = await createRmaFromReturn(session, returnRecord.return_id, {
        notes: `Created from return ${returnRecord.return_id}`,
      });
      const updatedReturn = created?.return || null;
      const rmaRecord = { ...created };
      delete rmaRecord.return;

      setRmasData((current) => [rmaRecord, ...current.filter((row) => row.rma_id !== rmaRecord.rma_id)]);
      if (updatedReturn) {
        setReturnsData((current) =>
          current.map((row) => (row.return_id === updatedReturn.return_id ? updatedReturn : row)),
        );
      }

      setSelectedRmaId(rmaRecord.rma_id);
      setActiveTab("rma");
      toast({ title: "RMA created", description: `RMA ${rmaRecord.rma_id} created from ${returnRecord.return_id}` });
    } catch (createError) {
      const message = createError.message || "Unable to create RMA";
      setError(message);
      toast({ title: "Create RMA failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const handleConfirmCancel = async (reason) => {
    if (!cancelTarget) return;

    try {
      const busyKey = `cancel-${cancelTarget.return_id}`;
      setActionKey(busyKey);
      setError("");

      const response = await cancelReturn(session, cancelTarget.return_id, {
        cancellation_reason: reason,
      });

      const updated = response?.document;
      if (updated) {
        setReturnsData((current) =>
          current.map((row) => (row.return_id === updated.return_id ? updated : row)),
        );
      }

      setCancelTarget(null);
      toast({
        title: "Return cancelled",
        description: response?.message || `Return ${cancelTarget.return_id} cancelled successfully`,
      });
    } catch (cancelError) {
      const message = cancelError.message || "Unable to cancel return";
      setError(message);
      toast({ title: "Cancellation failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const handleTransitionReturn = async (returnRecord, action, nextStatus) => {
    if (!returnRecord) return;
    const busyKey = `transition-${returnRecord.return_id}`;
    try {
      setActionKey(busyKey);
      setError("");
      const response = await transitionReturnStatus(session, returnRecord.return_id, action);
      const updated = response?.document || response;
      if (updated?.return_id) {
        setReturnsData((current) =>
          current.map((row) => (row.return_id === updated.return_id ? updated : row)),
        );
      } else {
        // optimistic update if backend doesn't return document
        setReturnsData((current) =>
          current.map((row) =>
            row.return_id === returnRecord.return_id
              ? { ...row, status: nextStatus }
              : row,
          ),
        );
      }
      toast({
        title: "Status updated",
        description: `Return ${returnRecord.return_id} moved to ${nextStatus}`,
      });
    } catch (err) {
      const message = err.message || "Unable to update status";
      setError(message);
      toast({ title: "Update failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const handleTransitionRma = async (rmaRecord, action, nextStatus) => {
    if (!rmaRecord) return;
    const busyKey = `rma-transition-${rmaRecord.rma_id}`;
    try {
      setActionKey(busyKey);
      setError("");
      const response = await transitionRmaStatus(session, rmaRecord.rma_id, action);
      const updated = response?.document;
      setRmasData((current) =>
        current.map((row) =>
          row.rma_id === rmaRecord.rma_id
            ? updated || { ...row, status: nextStatus }
            : row,
        ),
      );
      toast({
        title: "RMA updated",
        description: `RMA ${rmaRecord.rma_id} moved to ${nextStatus}`,
      });
    } catch (err) {
      const message = err.message || "Unable to update RMA";
      setError(message);
      toast({ title: "Update failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const handleConfirmCancelRma = async (reason) => {
    if (!cancelRmaTarget) return;
    const busyKey = `rma-cancel-${cancelRmaTarget.rma_id}`;
    try {
      setActionKey(busyKey);
      setError("");
      const response = await cancelRmaRequest(session, cancelRmaTarget.rma_id, reason);
      const updated = response?.document;
      setRmasData((current) =>
        current.map((row) =>
          row.rma_id === cancelRmaTarget.rma_id
            ? updated || { ...row, status: "cancelled" }
            : row,
        ),
      );
      setCancelRmaTarget(null);
      toast({
        title: "RMA cancelled",
        description: `RMA ${cancelRmaTarget.rma_id} cancelled successfully`,
      });
    } catch (err) {
      const message = err.message || "Unable to cancel RMA";
      setError(message);
      toast({ title: "Cancellation failed", description: message, variant: "destructive" });
    } finally {
      setActionKey("");
    }
  };

  const canProcessRma = useMemo(() => ["warehousemanager"].includes(roleId), [roleId]);

  const renderRmaActions = (rmaRecord) => {
    const actions = [];
    const transition = rmaStatusTransitions[rmaRecord.status];

    if (transition && canProcessRma) {
      const busyKey = `rma-transition-${rmaRecord.rma_id}`;
      actions.push(
        <Button
          key="rma-transition"
          size="sm"
          variant="outline"
          className="h-7 text-[11px] px-2"
          disabled={Boolean(actionKey) || loading}
          onClick={() => handleTransitionRma(rmaRecord, transition.action, transition.nextStatus)}
        >
          {actionKey === busyKey ? "Updating..." : transition.label}
        </Button>,
      );
    }

    if (rmaRecord.status === "open") {
      const busyKey = `rma-cancel-${rmaRecord.rma_id}`;
      actions.push(
        <Button
          key="rma-cancel"
          size="sm"
          variant="destructive"
          className="h-7 text-[11px] px-2"
          disabled={Boolean(actionKey) || loading}
          onClick={() => setCancelRmaTarget(rmaRecord)}
        >
          {actionKey === busyKey ? "Cancelling..." : "Cancel"}
        </Button>,
      );
    }

    if (actions.length === 0) {
      return <span className="text-xs text-muted-foreground">No actions</span>;
    }

    return <div className="flex flex-wrap gap-1">{actions}</div>;
  };

  const renderReturnActions = (row) => {
    const actions = [];
    const hasActiveRma = Boolean(row.active_rma_id);

    // Create RMA — only when no active RMA and status allows it
    if (canCreateRma && canCreateRmaFromStatus(row.status) && !hasActiveRma) {
      const busyKey = `create-rma-${row.return_id}`;
      actions.push(
        <Button
          key="create-rma"
          size="sm"
          variant="outline"
          className="h-7 text-[11px] px-2"
          disabled={Boolean(actionKey) || loading}
          onClick={(event) => {
            event.stopPropagation();
            handleCreateRma(row);
          }}
        >
          {actionKey === busyKey ? "Creating..." : "Create RMA"}
        </Button>,
      );
    }

    // Status transition — Confirm (created→confirmed) or Close (confirmed→closed)
    if (canTransitionReturn && canTransitionStatus(row.status)) {
      const transition = statusTransitions[row.status];
      const busyKey = `transition-${row.return_id}`;
      actions.push(
        <Button
          key="transition"
          size="sm"
          variant="outline"
          className="h-7 text-[11px] px-2"
          disabled={Boolean(actionKey) || loading}
          onClick={(event) => {
            event.stopPropagation();
            handleTransitionReturn(row, transition.action, transition.nextStatus);
          }}
        >
          {actionKey === busyKey ? "Updating..." : transition.label}
        </Button>,
      );
    }

    // Cancel — only on "created" status
    if (canCancelReturnRole && canCancelStatus(row.status)) {
      const busyKey = `cancel-${row.return_id}`;
      actions.push(
        <Button
          key="cancel-return"
          size="sm"
          variant="destructive"
          className="h-7 text-[11px] px-2"
          disabled={Boolean(actionKey) || loading}
          onClick={(event) => {
            event.stopPropagation();
            setCancelTarget(row);
          }}
        >
          {actionKey === busyKey ? "Cancelling..." : "Cancel"}
        </Button>,
      );
    }

    if (actions.length === 0) {
      return <span className="text-xs text-muted-foreground">No actions</span>;
    }

    return <div className="flex flex-wrap gap-1">{actions}</div>;
  };

  const returnsColumns = [
    { key: "return_id", label: "Return ID", sortable: true },
    { key: "shipment_id", label: "Shipment", sortable: true },
    { key: "customer_name", label: "Customer", sortable: true },
    { key: "sku_id", label: "SKU", sortable: true },
    { key: "qty", label: "Qty" },
    {
      key: "created_at",
      label: "Created At",
      sortable: true,
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => renderReturnActions(row),
    },
  ];

  // FIX: removed "Cancellation Reason" column from RMA table — no cancel flow for RMA
  const rmaColumns = [
    { key: "rma_id", label: "RMA ID", sortable: true },
    { key: "return_id", label: "Return ID", sortable: true },
    {
      key: "created_at",
      label: "Created At",
      sortable: true,
      render: (row) => formatDateTime(row.created_at),
    },
    { key: "created_by", label: "Created By", sortable: true },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()}>
          {renderRmaActions(row)}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Returns" }]} />
      <h1 className="text-2xl font-bold mb-4">Returns</h1>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="returns">Returns</TabsTrigger>
          <TabsTrigger value="rma">RMA</TabsTrigger>
        </TabsList>

        <TabsContent value="returns" className="mt-4 space-y-4">
          <DataTable
            columns={returnsColumns}
            data={returnsData}
            onRowClick={(row) => setSelectedReturnId(row.return_id)}
            actions={
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={loadData} disabled={loading || Boolean(actionKey)}>
                  Refresh
                </Button>
                {canCreateReturnPermission && (
                  <Button
                    size="sm"
                    onClick={() => setShowCreateReturn(true)}
                    disabled={loading || Boolean(actionKey)}
                  >
                    Create Return
                  </Button>
                )}
              </div>
            }
          />

          {selectedReturn && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  Return {selectedReturn.return_id}
                  <StatusBadge status={selectedReturn.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <WorkflowStepper steps={stepperForReturnStatus(selectedReturn.status)} />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p>{selectedReturn.customer_name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created At</p>
                    <p>{formatDateTime(selectedReturn.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created By</p>
                    <p>{selectedReturn.created_by || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Shipment</p>
                    <p>{selectedReturn.shipment_id || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">SKU</p>
                    <p>{selectedReturn.sku_id || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p>{selectedReturn.qty}</p>
                  </div>
                </div>

                {selectedReturn.notes && (
                  <p className="text-xs text-muted-foreground">Notes: {selectedReturn.notes}</p>
                )}
                {selectedReturn.cancellation_reason && (
                  <p className="text-xs text-destructive">
                    Cancellation Reason: {selectedReturn.cancellation_reason}
                  </p>
                )}

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left px-2 py-1">SKU</th>
                        <th className="text-left px-2 py-1">Qty</th>
                        <th className="text-left px-2 py-1">Reason Code</th>
                        <th className="text-left px-2 py-1">Linked RMA</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="px-2 py-1">{selectedReturn.sku_id || "-"}</td>
                        <td className="px-2 py-1">{selectedReturn.qty}</td>
                        <td className="px-2 py-1">
                          {reasonCodesForSelectedReturn.length > 0
                            ? reasonCodesForSelectedReturn.join(", ")
                            : selectedReturn.reason_code || "-"}
                        </td>
                        <td className="px-2 py-1">
                          {relatedRmasForSelectedReturn.length === 0 ? (
                            <span className="text-muted-foreground">No RMA linked</span>
                          ) : (
                            relatedRmasForSelectedReturn.map((row) => (
                              <button
                                key={row.rma_id}
                                className="text-blue-600 underline mr-2 text-xs"
                                onClick={() => {
                                  setSelectedRmaId(row.rma_id);
                                  setActiveTab("rma");
                                }}
                              >
                                {row.rma_id}
                              </button>
                            ))
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>{renderReturnActions(selectedReturn)}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rma" className="mt-4 space-y-4">
          <DataTable
            columns={rmaColumns}
            data={rmasData}
            onRowClick={(row) => setSelectedRmaId(row.rma_id)}
            actions={
              <Button size="sm" variant="outline" onClick={loadData} disabled={loading || Boolean(actionKey)}>
                Refresh
              </Button>
            }
          />

          {selectedRma && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  RMA {selectedRma.rma_id}
                  <StatusBadge status={selectedRma.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <WorkflowStepper steps={stepperForRmaStatus(selectedRma.status)} />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Return ID</p>
                    <p>{selectedRma.return_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created At</p>
                    <p>{formatDateTime(selectedRma.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created By</p>
                    <p>{selectedRma.created_by || "-"}</p>
                  </div>
                </div>

                {selectedRma.notes && (
                  <p className="text-xs text-muted-foreground">Notes: {selectedRma.notes}</p>
                )}

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left px-2 py-1">RMA Item ID</th>
                        <th className="text-left px-2 py-1">SKU</th>
                        <th className="text-left px-2 py-1">Qty</th>
                        <th className="text-left px-2 py-1">Reason Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedRma.items || []).length === 0 && (
                        <tr>
                          <td className="px-2 py-2 text-muted-foreground" colSpan={4}>
                            No items available.
                          </td>
                        </tr>
                      )}
                      {(selectedRma.items || []).map((item) => (
                        <tr key={item.rma_item_id} className="border-t">
                          <td className="px-2 py-1">{item.rma_item_id}</td>
                          <td className="px-2 py-1">{item.sku_id}</td>
                          <td className="px-2 py-1">{item.qty}</td>
                          <td className="px-2 py-1">{item.reason_code || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>{renderRmaActions(selectedRma)}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateReturn} onOpenChange={setShowCreateReturn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Return</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="return-shipment">Shipment ID</Label>
                <Input
                  id="return-shipment"
                  value={createForm.shipment_id}
                  onChange={(event) => updateCreateForm("shipment_id", event.target.value)}
                  placeholder="SHP000031"
                />
                {createFormErrors.shipment_id && (
                  <p className="text-xs text-destructive">{createFormErrors.shipment_id}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="return-customer-id">Customer ID</Label>
                <Input
                  id="return-customer-id"
                  value={createForm.customer_id}
                  onChange={(event) => updateCreateForm("customer_id", event.target.value)}
                  placeholder="CUS000001"
                />
                {createFormErrors.customer_id && (
                  <p className="text-xs text-destructive">{createFormErrors.customer_id}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="return-customer-name">Customer Name</Label>
                <Input
                  id="return-customer-name"
                  value={createForm.customer_name}
                  onChange={(event) => updateCreateForm("customer_name", event.target.value)}
                  placeholder="RetailMax"
                />
                {createFormErrors.customer_name && (
                  <p className="text-xs text-destructive">{createFormErrors.customer_name}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="return-sku-id">SKU ID</Label>
                <Input
                  id="return-sku-id"
                  value={createForm.sku_id}
                  onChange={(event) => updateCreateForm("sku_id", event.target.value)}
                  placeholder="SKU000002"
                />
                {createFormErrors.sku_id && (
                  <p className="text-xs text-destructive">{createFormErrors.sku_id}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="return-qty">Quantity</Label>
                <Input
                  id="return-qty"
                  type="number"
                  min="1"
                  value={createForm.qty}
                  onChange={(event) => updateCreateForm("qty", event.target.value)}
                />
                {createFormErrors.qty && (
                  <p className="text-xs text-destructive">{createFormErrors.qty}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Reason Code</Label>
                <Select
                  value={createForm.reason_code}
                  onValueChange={(value) => {
                    updateCreateForm("reason_code", value);
                    const reason = returnReasonOptions.find((item) => item.value === value);
                    if (!createForm.reason_description && reason) {
                      updateCreateForm("reason_description", reason.label);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {returnReasonOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createFormErrors.reason_code && (
                  <p className="text-xs text-destructive">{createFormErrors.reason_code}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="return-reason-desc">Reason Description</Label>
              <Input
                id="return-reason-desc"
                value={createForm.reason_description}
                onChange={(event) => updateCreateForm("reason_description", event.target.value)}
                placeholder="Additional reason details"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="return-notes">Notes</Label>
              <Textarea
                id="return-notes"
                rows={3}
                value={createForm.notes}
                onChange={(event) => updateCreateForm("notes", event.target.value)}
                placeholder="Optional notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateReturn(false)}
                disabled={actionKey === "create-return"}
              >
                Back
              </Button>
              <Button onClick={submitCreateReturn} disabled={actionKey === "create-return"}>
                {actionKey === "create-return" ? "Creating..." : "Create Return"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CancellationConfirmModal
        open={Boolean(cancelTarget)}
        documentType="return"
        documentId={cancelTarget?.return_id || ""}
        submitting={actionKey.startsWith("cancel-")}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
      />

      <CancellationConfirmModal
        open={Boolean(cancelRmaTarget)}
        documentType="RMA"
        documentId={cancelRmaTarget?.rma_id || ""}
        submitting={actionKey.startsWith("rma-cancel-")}
        onClose={() => setCancelRmaTarget(null)}
        onConfirm={handleConfirmCancelRma}
      />
    </AppLayout>
  );
};

export default ReturnsPage;