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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  cancelInboundDocument,
  fetchAsns,
  fetchGrns,
  toSessionContext,
  transitionAsn,
  transitionGrn,
} from "@/services/api";
import CreateASN from "./CreateASN";
import CreateGRN from "./CreateGRN";

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

const asnActionLabels = {
  submit: "Submit",
  mark_in_transit: "Mark In Transit",
  mark_arrived: "Mark Arrived",
  close: "Close",
  cancel: "Cancel ASN",
};

const grnActionLabels = {
  start_receiving: "Start Receiving",
  complete: "Complete",
  post: "Post",
  cancel: "Cancel GRN",
};

const asnStatusActions = {
  draft: ["submit", "cancel"],
pending: ["mark_in_transit"],
in_transit: ["mark_arrived"],
arrived: ["close"],
closed: [],
cancelled: [],
};

const grnStatusActions = {
  draft: ["start_receiving", "cancel"],
  receiving: ["complete", "cancel"],
  completed: ["post", "cancel"],
  posted: [],
  cancelled: [],
};

const inboundTabs = new Set(["asn", "grn"]);
const asnQueryStatuses = new Set(["open", "draft", "pending", "in_transit", "arrived", "closed", "cancelled"]);
const grnQueryStatuses = new Set(["open", "draft", "receiving", "completed", "posted", "cancelled"]);
const inboundStatusFilters = new Set([
  "open",
  "draft",
  "pending",
  "in_transit",
  "arrived",
  "closed",
  "receiving",
  "completed",
  "posted",
  "cancelled",
]);

const transitionPermissions = {
  asn: {
    submit: ["warehousemanager", "storekeeper"],
    mark_in_transit: ["warehousemanager"],
    mark_arrived: ["warehousemanager"],
    close: ["warehousemanager"],
  },
  grn: {
    start_receiving: ["warehousemanager", "storekeeper"],
    complete: ["warehousemanager", "storekeeper"],
    post: ["warehousemanager"],
  },
};

const cancelPermissions = ["warehousemanager", "superadmin", "hqadmin", "storemanager"];

function normalizeRole(roleId) {
  return roleAliases[String(roleId || "readonly").toLowerCase()] || "readonly";
}

function canTransition(roleId, entityType, action) {
  return (transitionPermissions[entityType]?.[action] || []).includes(roleId);
}

function canCancelRole(roleId) {
  return cancelPermissions.includes(roleId);
}

function toStepperSteps(currentStatus, flow) {
  if (currentStatus === "cancelled") {
    return flow.map((label, index) => ({
      label: label.replace(/_/g, " "),
      status: index === 0 ? "current" : "pending",
    }));
  }

  let reachedCurrent = false;
  return flow.map((status) => {
    if (status === currentStatus) {
      reachedCurrent = true;
      return { label: status.replace(/_/g, " "), status: "current" };
    }

    if (!reachedCurrent) {
      return { label: status.replace(/_/g, " "), status: "completed" };
    }

    return { label: status.replace(/_/g, " "), status: "pending" };
  });
}

function formatCreatedDate(value) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
}

function parseInboundQuery(search) {
  const params = new URLSearchParams(search || "");
  const rawTab = String(params.get("tab") || "").toLowerCase();
  const tab = inboundTabs.has(rawTab) ? rawTab : "asn";

  const rawStatus = String(params.get("status") || "").toLowerCase();
  const status = inboundStatusFilters.has(rawStatus) ? rawStatus : "";

  const rawDate = String(params.get("date") || "").toLowerCase();
  const date = rawDate === "today" ? "today" : "";

  return { tab, status, date };
}

const InboundPage = () => {
  const auth = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const session = useMemo(() => toSessionContext(auth), [auth]);
  const roleId = useMemo(() => normalizeRole(auth.currentUser?.role), [auth.currentUser?.role]);
  const [activeTab, setActiveTab] = useState("asn");
  const [routeFilters, setRouteFilters] = useState({ status: "", date: "" });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittingKey, setSubmittingKey] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [asns, setAsns] = useState([]);
  const [grns, setGrns] = useState([]);

  const [selectedAsn, setSelectedAsn] = useState(null);
  const [selectedGrn, setSelectedGrn] = useState(null);

  const [showCreateAsn, setShowCreateAsn] = useState(false);
  const [showCreateGrn, setShowCreateGrn] = useState(false);
  const [cancellationTarget, setCancellationTarget] = useState(null);

  useEffect(() => {
    const parsed = parseInboundQuery(location.search);
    setActiveTab(parsed.tab);
    setRouteFilters({
      status: parsed.status,
      date: parsed.date,
    });
  }, [location.search]);

  const loadInboundData = useCallback(async () => {
    const requestSession = {
      tenant_id: session.tenant_id,
      user_id: session.user_id,
      role_id: session.role_id,
      warehouse_id: session.warehouse_id,
    };

    if (!requestSession.tenant_id) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      const asnParams = {
        status: asnQueryStatuses.has(routeFilters.status) ? routeFilters.status : undefined,
        date: routeFilters.date || undefined,
        page: 1,
        pageSize: 200,
      };
      const grnParams = {
        status: grnQueryStatuses.has(routeFilters.status) ? routeFilters.status : undefined,
        date: routeFilters.date || undefined,
        page: 1,
        pageSize: 200,
      };
      const [asnRows, grnRows] = await Promise.all([
        fetchAsns(requestSession, asnParams),
        fetchGrns(requestSession, grnParams),
      ]);
      const asnItems = Array.isArray(asnRows?.data)
  ? asnRows.data
  : Array.isArray(asnRows)
  ? asnRows
  : [];

const grnItems = Array.isArray(grnRows?.data)
  ? grnRows.data
  : Array.isArray(grnRows)
  ? grnRows
  : [];
      setAsns(asnItems);
      setGrns(grnItems);
    } catch (loadError) {
      setError(loadError.message || "Failed to load inbound data");
    } finally {
      setLoading(false);
    }
  }, [routeFilters.date, routeFilters.status, session.tenant_id, session.user_id, session.role_id, session.warehouse_id]);

  useEffect(() => {
    loadInboundData();
  }, [loadInboundData]);

  const runAsnTransition = async (record, action) => {
    try {
      setSubmittingKey(`${record.asn_id}-${action}`);
      setError("");
      const response = await transitionAsn(session, record.asn_id, action);
const updated = response.data;
      setAsns((current) => current.map((row) => (row.asn_id === updated.asn_id ? updated : row)));
      setSelectedAsn((current) => (current?.asn_id === updated.asn_id ? updated : current));

      toast({
        title: "ASN status updated",
        description: `ASN ${updated.asn_id} ${asnActionLabels[action]}`,
      });
    } catch (transitionError) {
      const message = transitionError.message || "Unable to update ASN status";
      setError(message);
      toast({ title: "Transition failed", description: message, variant: "destructive" });
    } finally {
      setSubmittingKey("");
    }
  };

  const runGrnTransition = async (record, action) => {
    try {
      setSubmittingKey(`${record.grn_id}-${action}`);
      setError("");
      const updated = await transitionGrn(session, record.grn_id, action);
      setGrns((current) => current.map((row) => (row.grn_id === updated.grn_id ? updated : row)));
      setSelectedGrn((current) => (current?.grn_id === updated.grn_id ? updated : current));

      toast({
        title: "GRN status updated",
        description: `GRN ${updated.grn_id} ${grnActionLabels[action]}`,
      });
    } catch (transitionError) {
      const message = transitionError.message || "Unable to update GRN status";
      setError(message);
      toast({ title: "Transition failed", description: message, variant: "destructive" });
    } finally {
      setSubmittingKey("");
    }
  };

const performCancellation = async (reason) => {
  if (!cancellationTarget) return;

  const { entity, record } = cancellationTarget;
  const documentId = entity === "asn" ? record.asn_id : record.grn_id;

  try {
    setCancelling(true);
    setError("");

    let response;

    if (entity === "asn") {
  response = await transitionAsn(session, documentId, "cancel", {
    cancellation_reason: reason,
  });

  const updated = response.data;

      setAsns((current) =>
        current.map((row) =>
          row.asn_id === updated.asn_id ? updated : row
        )
      );

    } else {
      response = await transitionGrn(session, documentId, "cancel", {
  cancellation_reason: reason,
});
      const updated = response.data;

      setGrns((current) =>
        current.map((row) =>
          row.grn_id === updated.grn_id ? updated : row
        )
      );
    }

    toast({
      title: "Cancellation complete",
      description: `${entity.toUpperCase()} cancelled successfully`,
    });

    setCancellationTarget(null);

  } catch (cancelError) {
    const message = cancelError.message || "Unable to cancel document";
    setError(message);

    toast({
      title: "Cancellation failed",
      description: message,
      variant: "destructive",
    });

  } finally {
    setCancelling(false);
  }
};

  const handleAsnAction = (record, action) => {
    if (action === "cancel") {
      setCancellationTarget({ entity: "asn", record });
      return;
    }
    runAsnTransition(record, action);
  };

  const handleGrnAction = (record, action) => {
    if (action === "cancel") {
      setCancellationTarget({ entity: "grn", record });
      return;
    }
    runGrnTransition(record, action);
  };

  const renderActionButtons = (entity, record) => {
    const actionMap = entity === "asn" ? asnStatusActions : grnStatusActions;
    const labels = entity === "asn" ? asnActionLabels : grnActionLabels;
    const actions = actionMap[record.status] || [];
    const visibleActions = actions.filter((action) => {
      if (action === "cancel") {
        return canCancelRole(roleId);
      }
      return canTransition(roleId, entity, action);
    });

    if (visibleActions.length === 0) {
      return <span className="text-xs text-muted-foreground">No actions</span>;
    }

    return (
      <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
        {visibleActions.map((action) => {
          const recordId = entity === "asn" ? record.asn_id : record.grn_id;
          const key = `${recordId}-${action}`;
          const isBusy = submittingKey === key;
          return (
            <Button
              key={action}
              size="sm"
              variant={action === "cancel" ? "destructive" : "outline"}
              disabled={Boolean(submittingKey) || cancelling}
              onClick={() =>
                entity === "asn" ? handleAsnAction(record, action) : handleGrnAction(record, action)
              }
              className="h-7 text-[11px] px-2"
            >
              {isBusy ? "Working..." : labels[action]}
            </Button>
          );
        })}
      </div>
    );
  };

  const asnColumns = [
    { key: "asn_id", label: "ASN ID", sortable: true },
    { key: "supplier_name", label: "Supplier", sortable: true },
    {
      key: "created_at",
      label: "Created Date",
      sortable: true,
      render: (row) => formatCreatedDate(row.created_at),
    },
    { key: "eta", label: "ETA", sortable: true },
    { key: "lines_count", label: "Lines" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "cancellation_reason",
      label: "Cancellation Reason",
      render: (row) => row.cancellation_reason || "-",
    },
    { key: "actions", label: "Actions", render: (row) => renderActionButtons("asn", row) },
  ];

  const grnColumns = [
    { key: "grn_id", label: "GRN ID", sortable: true },
    { key: "asn_id", label: "ASN", render: (row) => row.asn_id || "-" },
    { key: "supplier_name", label: "Supplier", sortable: true },
    {
      key: "created_at",
      label: "Created Date",
      sortable: true,
      render: (row) => formatCreatedDate(row.created_at),
    },
    { key: "received_date", label: "Date", sortable: true },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    {
      key: "cancellation_reason",
      label: "Cancellation Reason",
      render: (row) => row.cancellation_reason || "-",
    },
    { key: "actions", label: "Actions", render: (row) => renderActionButtons("grn", row) },
  ];

  const selectedAsnDetails = selectedAsn
    ? asns.find((row) => row.asn_id === selectedAsn.asn_id) || selectedAsn
    : null;
  const selectedGrnDetails = selectedGrn
    ? grns.find((row) => row.grn_id === selectedGrn.grn_id) || selectedGrn
    : null;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Inbound" }]} />
      <h1 className="text-2xl font-bold mb-4">Inbound</h1>

      {error && <div className="mb-3 text-sm text-destructive">{error}</div>}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="asn">ASN</TabsTrigger>
          <TabsTrigger value="grn">Goods Receipt</TabsTrigger>
        </TabsList>

        <TabsContent value="asn" className="mt-4 space-y-4">
          <DataTable
            columns={asnColumns}
            data={asns}
            onRowClick={setSelectedAsn}
            actions={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadInboundData}
                  disabled={loading || Boolean(submittingKey) || cancelling}
                >
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setShowCreateAsn(true)}>
                  Create ASN
                </Button>
              </div>
            }
          />

          {selectedAsnDetails && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  ASN {selectedAsnDetails.asn_id}
                  <StatusBadge status={selectedAsnDetails.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <WorkflowStepper
                  steps={toStepperSteps(selectedAsnDetails.status, ["draft", "pending", "in_transit", "arrived", "closed"])}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Supplier</p>
                    <p>{selectedAsnDetails.supplier_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ETA</p>
                    <p>{selectedAsnDetails.eta}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lines</p>
                    <p>{selectedAsnDetails.lines_count}</p>
                  </div>
                </div>
                {selectedAsnDetails.status === "cancelled" && (
                  <p className="text-xs text-amber-700">This ASN is cancelled and cannot be changed.</p>
                )}
                {selectedAsnDetails.cancellation_reason && (
                  <p className="text-xs text-muted-foreground">Reason: {selectedAsnDetails.cancellation_reason}</p>
                )}
                <div>{renderActionButtons("asn", selectedAsnDetails)}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="grn" className="mt-4 space-y-4">
          <DataTable
            columns={grnColumns}
            data={grns}
            onRowClick={setSelectedGrn}
            actions={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadInboundData}
                  disabled={loading || Boolean(submittingKey) || cancelling}
                >
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setShowCreateGrn(true)}>
                  Create GRN
                </Button>
              </div>
            }
          />

          {selectedGrnDetails && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  GRN {selectedGrnDetails.grn_id}
                  <StatusBadge status={selectedGrnDetails.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <WorkflowStepper
                  steps={toStepperSteps(selectedGrnDetails.status, ["draft", "receiving", "completed", "posted"])}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">ASN</p>
                    <p>{selectedGrnDetails.asn_id || "Direct Receipt"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Supplier</p>
                    <p>{selectedGrnDetails.supplier_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Receiving Date</p>
                    <p>{selectedGrnDetails.received_date}</p>
                  </div>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="text-left px-2 py-1">SKU</th>
                        <th className="text-left px-2 py-1">Expected</th>
                        <th className="text-left px-2 py-1">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedGrnDetails.lines || []).map((line) => (
                        <tr key={`${selectedGrnDetails.grn_id}-${line.line_no}`} className="border-t">
                          <td className="px-2 py-1">{line.sku_id}</td>
                          <td className="px-2 py-1">{line.expected_qty}</td>
                          <td className="px-2 py-1">{line.received_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedGrnDetails.status === "cancelled" && (
                  <p className="text-xs text-amber-700">This GRN is cancelled and cannot be changed.</p>
                )}
                {selectedGrnDetails.cancellation_reason && (
                  <p className="text-xs text-muted-foreground">Reason: {selectedGrnDetails.cancellation_reason}</p>
                )}
                <div>{renderActionButtons("grn", selectedGrnDetails)}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateAsn} onOpenChange={setShowCreateAsn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ASN</DialogTitle>
          </DialogHeader>
          <CreateASN
            session={session}
            onCancel={() => setShowCreateAsn(false)}
            onCreated={(created) => {
              setAsns((current) => [created, ...current]);
              setShowCreateAsn(false);
              toast({ title: "ASN created", description: `Created ${created.asn_id}` });
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateGrn} onOpenChange={setShowCreateGrn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create GRN</DialogTitle>
          </DialogHeader>
          <CreateGRN
            session={session}
            asns={asns}
            onCancel={() => setShowCreateGrn(false)}
            onCreated={(created) => {
              setGrns((current) => [created, ...current]);
              setShowCreateGrn(false);
              toast({ title: "GRN created", description: `Created ${created.grn_id}` });
            }}
          />
        </DialogContent>
      </Dialog>

      <CancellationConfirmModal
        open={Boolean(cancellationTarget)}
        documentType={cancellationTarget?.entity}
        documentId={
          cancellationTarget
            ? cancellationTarget.entity === "asn"
              ? cancellationTarget.record.asn_id
              : cancellationTarget.record.grn_id
            : ""
        }
        submitting={cancelling}
        onClose={() => setCancellationTarget(null)}
        onConfirm={performCancellation}
      />
    </AppLayout>
  );
};

export default InboundPage;
