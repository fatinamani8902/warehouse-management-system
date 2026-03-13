import CreateOrder from "./CreateOrder";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WorkflowStepper } from "@/components/shared/WorkflowStepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { fetchOrders, releaseOrder, toSessionContext } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

const orderFlow = [
  "draft",
  "released",
  "picking",
  "packed",
  "shipped",
  "completed",
];

function toStepperSteps(currentStatus) {
  let reachedCurrent = false;

  return orderFlow.map((status) => {
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

export default function OutboundPage() {
  const auth = useAuth();
  const session = useMemo(() => toSessionContext(auth), [auth]);

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);

  /* ---------- LOAD ORDERS ---------- */

  const loadOrders = async () => {
    try {
      const response = await fetchOrders(session);
      console.log("ORDERS API RESPONSE:", response);

      const items = (response?.data || []).map((order) => ({
  ...order,

  customer_name: order.customer_name || "N/A",

  created_at: order.createdAt || order.created_at || new Date().toISOString(),

  lines_count: order.lines_count || (order.lines ? order.lines.length : 0),

  lines: order.lines || []
}));

      setOrders(items);

      if (selectedOrder) {
        const updated = items.find(
          (o) => o.order_id === selectedOrder.order_id
        );
        setSelectedOrder(updated || null);
      }
    } catch (error) {
      console.error("Failed to load orders:", error);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [session]);

  /* ---------- RELEASE ORDER ---------- */

const handleRelease = async (orderId) => {

  const order = orders.find(o => o.order_id === orderId);

  if (!order || order.lines_count === 0) {
    alert("Add at least one SKU line before releasing order");
    return;
  }

  try {

    await releaseOrder(session, orderId);

    /* UPDATE LOCAL STATE - JANGAN RELOAD API */

    setOrders(prev =>
      prev.map(o =>
        o.order_id === orderId
          ? { ...o, status: "released" }
          : o
      )
    );

    if (selectedOrder?.order_id === orderId) {
      setSelectedOrder(prev => ({
        ...prev,
        status: "released"
      }));
    }

  } catch (error) {

    console.error(error);
    alert("Failed to release order");

  }

};

  /* ---------- GENERIC STATUS UPDATE ---------- */

  const updateStatus = (orderId, newStatus) => {

    setOrders((prev) =>
      prev.map((o) =>
        o.order_id === orderId
          ? { ...o, status: newStatus }
          : o
      )
    );

    if (selectedOrder?.order_id === orderId) {
      setSelectedOrder((prev) => ({
        ...prev,
        status: newStatus
      }));
    }
  };

  /* ---------- CANCEL ORDER ---------- */

  const handleCancel = (orderId) => {
    const reason = prompt("Enter cancellation reason");

    setOrders((prev) =>
      prev.map((o) =>
        o.order_id === orderId
          ? {
              ...o,
              status: "cancelled",
              cancellation_reason: reason || "Cancelled",
            }
          : o
      )
    );

    if (selectedOrder?.order_id === orderId) {
      setSelectedOrder((prev) => ({
        ...prev,
        status: "cancelled",
        cancellation_reason: reason || "Cancelled",
      }));
    }
  };

  /* ---------- ADD ORDER LINE ---------- */

  const handleAddLine = () => {
    if (!selectedOrder) return;

    const sku = prompt("Enter SKU ID");
    const qtyInput = prompt("Enter Quantity");

    const qty = Number(qtyInput);

    if (!sku || !qtyInput || isNaN(qty) || qty <= 0) {
      alert("Invalid SKU or quantity");
      return;
    }

    setOrders((prev) =>
      prev.map((order) => {
        if (order.order_id !== selectedOrder.order_id) return order;

        const newLine = {
          sku_id: sku.trim(),
          ordered_qty: qty,
          picked_qty: 0,
        };

        const updatedLines = [...(order.lines || []), newLine];

        return {
          ...order,
          lines: updatedLines,
          lines_count: updatedLines.length,
        };
      })
    );

    setSelectedOrder((prev) => {
      if (!prev) return prev;

      const newLine = {
        sku_id: sku.trim(),
        ordered_qty: qty,
        picked_qty: 0,
      };

      const updatedLines = [...(prev.lines || []), newLine];

      return {
        ...prev,
        lines: updatedLines,
        lines_count: updatedLines.length,
      };
    });
  };

  /* ---------- TABLE ---------- */

  const columns = [
    { key: "order_id", label: "Order ID", sortable: true },
    { key: "customer_name",
  label: "Customer",
  sortable: true,
  render: (row) => row.customer_name || row.customer || "-", },
    {
      key: "created_at",
      label: "Created Date",
      sortable: true,
      render: (row) => {
      const date = row.created_at || row.createdAt;

      return date
      ? new Date(date).toLocaleString()
      : "-";
  },
},
    {
      key: "lines_count",
  label: "Lines",
  render: (row) =>
    row.lines_count || (row.lines ? row.lines.length : 0),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "cancellation_reason",
      label: "Cancellation Reason",
      render: (row) => row.cancellation_reason || "-",
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => {

        if (row.status === "draft") {
          return (
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={row.lines_count === 0}
                onClick={() => handleRelease(row.order_id)}
              >
                Release
              </Button>

              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleCancel(row.order_id)}
              >
                Cancel
              </Button>
            </div>
          );
        }

        if (row.status === "released") {
  return <span className="text-xs text-muted-foreground">No actions</span>;
}

        return <span className="text-xs text-muted-foreground">No actions</span>;
      },
    },
  ];

  const selectedOrderDetails = selectedOrder
    ? orders.find((o) => o.order_id === selectedOrder.order_id) ||
      selectedOrder
    : null;

  return (
    <AppLayout>
      <Breadcrumbs items={[{ label: "Outbound" }]} />

      <h1 className="text-2xl font-bold mb-4">Outbound Orders</h1>

      <DataTable
        columns={columns}
        data={orders}
        onRowClick={setSelectedOrder}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={loadOrders}>
              Refresh
            </Button>

            <Button size="sm" onClick={() => setShowCreateOrder(true)}>
              Create Order
            </Button>
          </div>
        }
      />

      {selectedOrderDetails && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Order {selectedOrderDetails.order_id}
              <StatusBadge status={selectedOrderDetails.status} />
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 text-sm">
            <WorkflowStepper
              steps={toStepperSteps(selectedOrderDetails.status)}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p>{selectedOrderDetails.customer_name}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Created Date
                </p>
                <p>
                    {selectedOrderDetails.created_at || selectedOrderDetails.createdAt
                    ? new Date(
                    selectedOrderDetails.created_at ||
                    selectedOrderDetails.createdAt
                    ).toLocaleString()
                    : "-"}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Lines</p>
                <p>{selectedOrderDetails.lines_count || 0}</p>
              </div>
            </div>

            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-2 py-1">SKU</th>
                    <th className="text-left px-2 py-1">Ordered Qty</th>
                    <th className="text-left px-2 py-1">Picked Qty</th>
                  </tr>
                </thead>

                <tbody>
                  {(selectedOrderDetails.lines || []).map((line) => (
                    <tr
                      key={`${selectedOrderDetails.order_id}-${line.sku_id}`}
                      className="border-t"
                    >
                      <td className="px-2 py-1">{line.sku_id}</td>
                      <td className="px-2 py-1">{line.ordered_qty}</td>
                      <td className="px-2 py-1">
                        {line.picked_qty || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleAddLine}
              disabled={selectedOrderDetails.status !== "draft"}
            >
              + Add SKU Line
            </Button>
          </CardContent>
        </Card>
      )}

      {showCreateOrder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white p-6 rounded-md w-[420px] shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Create Order</h2>

            <CreateOrder
              onCreated={(order) => {
              setOrders((prev) => [order, ...prev]);

              /* AUTO OPEN ORDER DETAILS */

              setSelectedOrder(order);
              setShowCreateOrder(false);

            }}
              onCancel={() => setShowCreateOrder(false)}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}