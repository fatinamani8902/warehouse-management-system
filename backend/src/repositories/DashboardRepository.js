import { inventoryScopedBalancesFromSql } from "./InventoryReadRepository.js";
import {
  packingActiveStatusSql,
  pickListStatusScopeCte,
  shippingReadyToDispatchStatusSql,
} from "./OutboundRepository.js";
import { visiblePutawayScopeCte } from "./PutawayRepository.js";
import { returnsWorkflowScopeCte } from "./ReturnsRepository.js";

function numberValue(value) {
  return Number(value || 0);
}

function rowMap(rows, key = "status") {
  return new Map(rows.map((row) => [String(row[key] || "").toLowerCase(), numberValue(row.count)]));
}

function countFrom(map, values) {
  return values.reduce((total, value) => total + numberValue(map.get(value)), 0);
}

function normalizeRoles(roles = []) {
  return Array.isArray(roles) ? roles.map((role) => String(role || "").toLowerCase()) : [];
}

function canViewManagerActions(roles = []) {
  const allowed = new Set(["superadmin", "hqadmin", "admin", "manager", "warehousemanager", "storemanager"]);
  return normalizeRoles(roles).some((role) => allowed.has(role));
}

async function validateDashboardWarehouseAccess(client, { tenantId, warehouseId, userId }) {
  const result = await client.query(
    `SELECT 1
     FROM public.user_warehouses
     WHERE tenant_id = $1
       AND warehouse_id = $2
       AND user_id = $3
     LIMIT 1`,
    [tenantId, warehouseId, userId]
  );
  return result.rowCount > 0;
}

function auditActionLabelSql() {
  return `CASE audit.action_code
          WHEN 'return_created' THEN 'Return Created'
          WHEN 'return_cancelled' THEN 'Return Cancelled'
          WHEN 'return_closed' THEN 'Return Closed'
          WHEN 'rma_created' THEN 'RMA Created'
          WHEN 'rma_processing_started' THEN 'RMA Processing Started'
          WHEN 'rma_completed' THEN 'RMA Completed'
          WHEN 'rma_cancelled' THEN 'RMA Cancelled'
          ELSE initcap(replace(audit.action_code, '_', ' '))
        END`;
}

async function getDashboardSummary(client, { tenantId, warehouseId, userId = null, roles = [] }) {
  const visiblePutaway = visiblePutawayScopeCte();
  const pickingStatusScope = pickListStatusScopeCte();
  const returnsWorkflowScope = returnsWorkflowScopeCte();
  const inventoryScopedBalances = inventoryScopedBalancesFromSql();
  const packingActiveStatuses = packingActiveStatusSql();
  const shippingReadyStatuses = shippingReadyToDispatchStatusSql();
  const auditActionLabel = auditActionLabelSql();

  const inbound = await client.query(
    `SELECT
       (SELECT count(*)::int
        FROM public.asns
        WHERE tenant_id = $1
          AND warehouse_id = $2
          AND created_at >= current_date
          AND created_at < current_date + interval '1 day') AS asn_created_today,
       (SELECT count(*)::int
        FROM public.grns
        WHERE tenant_id = $1
          AND warehouse_id = $2
          AND created_at >= current_date
          AND created_at < current_date + interval '1 day') AS grn_created_today,
       (SELECT count(*)::int
        FROM public.asns
        WHERE tenant_id = $1
          AND warehouse_id = $2
          AND lower(status) IN ('draft', 'pending', 'in_transit', 'arrived')) AS pending_inbound,
       (SELECT count(*)::int
        FROM public.grns
        WHERE tenant_id = $1
          AND warehouse_id = $2
          AND lower(status) = 'receiving') AS receiving_in_progress`,
    [tenantId, warehouseId]
  );

  const putaway = await client.query(
    `WITH ${visiblePutaway}
     SELECT lower(status) AS status, count(*)::int AS count
     FROM visible_putaway
     WHERE lower(status) IN ('pending', 'assigned', 'in_progress', 'exception')
     GROUP BY lower(status)`,
    [tenantId, warehouseId]
  );

  const inventory = await client.query(
    `SELECT
       coalesce(sum(qty_on_hand), 0)::numeric AS on_hand,
       coalesce(sum(qty_reserved), 0)::numeric AS reserved,
       coalesce(sum(qty_on_hand - qty_reserved), 0)::numeric AS available,
       coalesce(sum(qty_quarantine), 0)::numeric AS quarantine
     FROM ${inventoryScopedBalances}
     WHERE balance.tenant_id = $1
       AND balance.warehouse_id = $2`,
    [tenantId, warehouseId]
  );

  const picking = await client.query(
    `WITH ${pickingStatusScope}
     SELECT status, count(*)::int AS count
     FROM picking_statuses
     GROUP BY status`,
    [tenantId, warehouseId]
  );

  const shipping = await client.query(
    `SELECT
       count(*) FILTER (WHERE lower(shipment.status) IN ('packed', 'carton_generated'))::int AS ready_to_dispatch,
       count(*) FILTER (WHERE lower(shipment.status) = 'dispatched')::int AS dispatched,
       count(*) FILTER (WHERE lower(shipment.status) = 'closed')::int AS closed,
       count(*) FILTER (
         WHERE lower(shipment.status) NOT IN ('closed', 'cancelled')
           AND sales_order.ship_by_date IS NOT NULL
           AND sales_order.ship_by_date < current_date
       )::int AS overdue
     FROM public.shipments shipment
     LEFT JOIN public.sales_orders sales_order
       ON sales_order.tenant_id = shipment.tenant_id
      AND sales_order.warehouse_id = shipment.warehouse_id
      AND sales_order.so_id = shipment.so_id
     WHERE shipment.tenant_id = $1
       AND shipment.warehouse_id = $2`,
    [tenantId, warehouseId]
  );

  const approvals = await client.query(
    `SELECT
       (SELECT count(*)::int
        FROM public.cycle_counts
        WHERE tenant_id = $1
          AND warehouse_id = $2
          AND lower(status) = 'submitted') AS cycle_counts_submitted,
       (SELECT count(*)::int
        FROM public.adjustments
        WHERE tenant_id = $1
          AND warehouse_id = $2
          AND lower(status) = 'submitted') AS adjustments_submitted`,
    [tenantId, warehouseId]
  );

  const returns = await client.query(
    `WITH ${returnsWorkflowScope}
     SELECT
       (SELECT count(*)::int
        FROM returns_with_workflow
        WHERE workflow_status = 'Return Created') AS return_created,
       (SELECT count(*)::int
        FROM returns_with_workflow
        WHERE workflow_status IN ('Return Created', 'RMA Opened', 'RMA Processing', 'RMA Completed')) AS open_returns,
       (SELECT count(*)::int
        FROM public.rma rma
        JOIN public.returns return_row
          ON return_row.tenant_id = rma.tenant_id
         AND return_row.return_id = rma.return_id
        WHERE rma.tenant_id = $1
          AND return_row.warehouse_id = $2
          AND lower(rma.status) = 'processing') AS rma_processing,
       (SELECT count(*)::int
        FROM public.rma rma
        JOIN public.returns return_row
          ON return_row.tenant_id = rma.tenant_id
         AND return_row.return_id = rma.return_id
        WHERE rma.tenant_id = $1
          AND return_row.warehouse_id = $2
          AND lower(return_row.status) NOT IN ('closed', 'cancelled')
          AND lower(rma.status) IN ('created', 'open', 'processing', 'completed')) AS active_rmas,
       (SELECT count(*)::int
        FROM public.rma rma
        JOIN public.returns return_row
          ON return_row.tenant_id = rma.tenant_id
         AND return_row.return_id = rma.return_id
        WHERE rma.tenant_id = $1
          AND return_row.warehouse_id = $2
          AND lower(return_row.status) NOT IN ('closed', 'cancelled')
          AND lower(rma.status) = 'completed') AS returns_awaiting_closure`,
    [tenantId, warehouseId]
  );

  const statusSummary = await client.query(
    `WITH ${pickingStatusScope},
     ${visiblePutaway}
     SELECT
       (SELECT count(*)::int FROM public.asns WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'pending') AS inbound_pending_asn,
       (SELECT count(*)::int FROM public.asns WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'in_transit') AS inbound_in_transit_asn,
       (SELECT count(*)::int FROM public.asns WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'arrived') AS inbound_arrived_asn,
       (SELECT count(*)::int FROM public.grns WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'receiving') AS inbound_receiving_grn,
       (SELECT count(*)::int FROM public.grns WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) IN ('completed', 'posted')) AS inbound_completed_posted_grn,
       (SELECT count(*)::int FROM visible_putaway WHERE lower(status) IN ('pending', 'assigned', 'in_progress', 'exception')) AS warehouse_active_putaway,
       (SELECT count(*)::int FROM picking_statuses WHERE status IN ('open', 'assigned', 'in_progress')) AS warehouse_active_picking,
       (SELECT count(*)::int FROM public.packing_tasks WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) IN (${packingActiveStatuses})) AS warehouse_active_packing,
       (SELECT count(*)::int FROM public.shipments WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) IN (${shippingReadyStatuses})) AS outbound_ready_to_dispatch,
       (SELECT count(*)::int FROM public.shipments WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'dispatched') AS outbound_dispatched,
       (SELECT count(*)::int FROM public.shipments WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'closed') AS outbound_closed,
       (SELECT count(*)::int FROM public.cycle_counts WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'submitted') AS inventory_submitted_cycle_counts,
       (SELECT count(*)::int FROM public.adjustments WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'submitted') AS inventory_submitted_adjustments`,
    [tenantId, warehouseId]
  );

  const managerActionsAllowed = canViewManagerActions(roles);
  const pendingActions = await client.query(
      `WITH ${returnsWorkflowScope},
       ${visiblePutaway},
       ${pickingStatusScope},
       picking_assignments AS (
         SELECT tenant_id, warehouse_id, wave_id, min(assigned_to_user_id) AS operator_id
         FROM public.pick_tasks
         WHERE tenant_id = $1
           AND warehouse_id = $2
           AND assigned_to_user_id IS NOT NULL
         GROUP BY tenant_id, warehouse_id, wave_id
       ),
       action_rows AS (
         SELECT 'ASN' AS module, asn_id AS document_id, status AS raw_status,
                CASE WHEN lower(status) = 'in_transit' THEN 'ASN awaiting arrival' ELSE 'ASN awaiting progress' END AS action_message,
                created_at AS occurred_at, '/inbound?tab=asn' AS link, created_by AS actor_id, NULL::varchar AS operator_id, 2 AS priority, true AS manager_only
         FROM public.asns
         WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) IN ('pending', 'in_transit', 'arrived')
         UNION ALL
         SELECT 'GRN', grn_id, status,
                'GRN receiving in progress',
                created_at, '/inbound?tab=grn', received_by, NULL::varchar, 2, true
         FROM public.grns
         WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'receiving'
         UNION ALL
         SELECT 'Putaway', putaway_task_id, status,
                CASE WHEN lower(status) = 'exception' THEN 'Putaway exception requires attention' ELSE 'Putaway assigned' END,
                created_at, '/putaway', assigned_to_user_id, assigned_to_user_id, CASE WHEN lower(status) = 'exception' THEN 1 ELSE 3 END, false
         FROM visible_putaway
         WHERE lower(status) IN ('assigned', 'in_progress', 'exception')
         UNION ALL
         SELECT 'Cycle Count' AS module, cc_id AS document_id, status AS raw_status,
                'Cycle Count awaiting approval',
                coalesce(submitted_at, created_at) AS occurred_at, '/inventory?view=cycle-count' AS link, created_by AS actor_id, NULL::varchar, 4, true
         FROM public.cycle_counts
         WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'submitted'
         UNION ALL
         SELECT 'Adjustment', adj_id, status,
                'Inventory Adjustment awaiting approval',
                coalesce(submitted_at, created_at), '/inventory?view=adjustments', created_by, NULL::varchar, 4, true
         FROM public.adjustments
         WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'submitted'
         UNION ALL
         SELECT 'Picking', picking_statuses.wave_id, picking_statuses.status,
                'Picking awaiting completion',
                picking_statuses.created_at, '/picking', picking_statuses.created_by, picking_assignments.operator_id, 3, false
         FROM picking_statuses
         LEFT JOIN picking_assignments
           ON picking_assignments.wave_id = picking_statuses.wave_id
         WHERE picking_statuses.status IN ('open', 'assigned', 'in_progress')
         UNION ALL
         SELECT 'Packing', pack_task_id, status,
                'Packing awaiting completion',
                packing.created_at, '/packing', packing.packed_by, picking_assignments.operator_id, 3, false
         FROM public.packing_tasks packing
         LEFT JOIN picking_assignments
           ON picking_assignments.wave_id = packing.wave_id
         WHERE packing.tenant_id = $1 AND packing.warehouse_id = $2 AND lower(packing.status) IN (${packingActiveStatuses})
         UNION ALL
         SELECT 'Shipping', shipment_id, status,
                'Shipment ready for dispatch',
                created_at, '/shipping?status=packed', created_by, NULL::varchar, 3, true
         FROM public.shipments
         WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) IN (${shippingReadyStatuses})
         UNION ALL
         SELECT 'Returns', return_id, workflow_status,
                CASE
                  WHEN workflow_status = 'RMA Completed' THEN 'RMA completed - Return awaiting closure'
                  WHEN workflow_status = 'RMA Processing' THEN 'Return awaiting RMA completion'
                  WHEN workflow_status = 'RMA Opened' THEN 'RMA awaiting processing'
                  ELSE 'Return awaiting RMA'
                END,
                created_at, '/returns?tab=returns', created_by, NULL::varchar, 4, true
         FROM returns_with_workflow
         WHERE workflow_status IN ('Return Created', 'RMA Opened', 'RMA Processing', 'RMA Completed')
         UNION ALL
         SELECT 'RMA', rma.rma_id, rma.status,
                CASE
                  WHEN lower(rma.status) IN ('created', 'open') THEN 'RMA awaiting processing'
                  WHEN lower(rma.status) = 'processing' THEN 'RMA awaiting completion'
                  ELSE 'RMA completed - Return awaiting closure'
                END,
                rma.updated_at, '/returns?tab=rma', rma.created_by, NULL::varchar, 4, true
         FROM public.rma rma
         JOIN public.returns return_row
           ON return_row.tenant_id = rma.tenant_id
          AND return_row.return_id = rma.return_id
         WHERE rma.tenant_id = $1
           AND return_row.warehouse_id = $2
           AND lower(return_row.status) NOT IN ('closed', 'cancelled')
           AND lower(rma.status) IN ('created', 'open', 'processing', 'completed')
       ), ranked AS (
         SELECT *, row_number() OVER (PARTITION BY module ORDER BY priority ASC, occurred_at DESC, document_id DESC) AS rn
         FROM action_rows
         WHERE $3 = true
            OR (manager_only = false AND operator_id = $4)
       )
       SELECT ranked.module, ranked.document_id, ranked.raw_status, ranked.action_message, ranked.occurred_at, ranked.link,
              CASE
                WHEN users.user_name IS NOT NULL AND ranked.actor_id IS NOT NULL THEN users.user_name || ' (' || ranked.actor_id || ')'
                ELSE ranked.actor_id
              END AS actor_display
       FROM ranked
       LEFT JOIN public.users users
         ON users.tenant_id = $1
        AND users.user_id = ranked.actor_id
       WHERE rn <= 5
       ORDER BY priority ASC, occurred_at DESC, document_id DESC
       LIMIT 10`,
      [tenantId, warehouseId, managerActionsAllowed, userId],
    );

  const recentTransactions = await client.query(
    `WITH ${visiblePutaway},
     ${pickingStatusScope},
     transaction_rows AS (
       SELECT 'ASN' AS module, asn_id AS document_id, status, created_at AS occurred_at, created_by AS actor_id, '/inbound' AS link
       FROM public.asns WHERE tenant_id = $1 AND warehouse_id = $2
       UNION ALL
       SELECT 'GRN', grn_id, status, created_at, received_by, '/inbound'
       FROM public.grns WHERE tenant_id = $1 AND warehouse_id = $2
       UNION ALL
       SELECT 'Putaway', putaway_task_id, status, coalesce(completed_at, started_at, created_at), coalesce(completed_by, assigned_to_user_id), '/putaway'
       FROM visible_putaway
       UNION ALL
       SELECT 'Picking', wave_id, status, created_at, created_by, '/picking'
       FROM picking_statuses
       UNION ALL
       SELECT 'Packing', pack_task_id, status, coalesce(packed_at, updated_at, created_at), packed_by, '/packing'
       FROM public.packing_tasks WHERE tenant_id = $1 AND warehouse_id = $2
       UNION ALL
       SELECT 'Shipping', shipment_id, status, coalesce(closed_at, dispatched_at, updated_at, created_at), coalesce(dispatched_by, created_by), '/shipping'
       FROM public.shipments WHERE tenant_id = $1 AND warehouse_id = $2
       UNION ALL
       SELECT 'Cycle Count', cc_id, status, coalesce(approved_at, rejected_at, submitted_at, completed_at, created_at), coalesce(approved_by, rejected_by, submitted_by, created_by), '/inventory?view=cycle-count'
       FROM public.cycle_counts WHERE tenant_id = $1 AND warehouse_id = $2
       UNION ALL
       SELECT 'Adjustment', adj_id, status, coalesce(approved_at, rejected_at, submitted_at, cancelled_at, created_at), coalesce(approved_by, rejected_by, cancelled_by, created_by), '/inventory?view=adjustments'
       FROM public.adjustments WHERE tenant_id = $1 AND warehouse_id = $2
       UNION ALL
       SELECT CASE WHEN audit.entity_type = 'rma' THEN 'RMA' ELSE 'Returns' END,
              audit.entity_id,
              ${auditActionLabel},
              audit.created_at,
              audit.performed_by_user_id,
              CASE WHEN audit.entity_type = 'rma' THEN '/returns?tab=rma' ELSE '/returns?tab=returns' END
       FROM public.return_rma_audit_events audit
       LEFT JOIN public.returns return_row
         ON return_row.tenant_id = audit.tenant_id
        AND return_row.return_id = audit.return_id
       WHERE audit.tenant_id = $1
         AND return_row.warehouse_id = $2
       UNION ALL
       SELECT 'RMA', rma.rma_id, rma.status, coalesce(rma.closed_at, rma.cancelled_at, rma.updated_at, rma.created_at), coalesce(rma.cancelled_by, rma.created_by), '/returns?tab=rma'
       FROM public.rma rma
       JOIN public.returns return_row
         ON return_row.tenant_id = rma.tenant_id
        AND return_row.return_id = rma.return_id
       WHERE rma.tenant_id = $1
         AND return_row.warehouse_id = $2
         AND NOT EXISTS (
           SELECT 1
           FROM public.return_rma_audit_events audit
           WHERE audit.tenant_id = rma.tenant_id
             AND audit.rma_id = rma.rma_id
         )
     )
     SELECT transaction_rows.module, transaction_rows.document_id, transaction_rows.status,
            transaction_rows.occurred_at, transaction_rows.link,
            CASE
              WHEN users.user_name IS NOT NULL AND transaction_rows.actor_id IS NOT NULL THEN users.user_name || ' (' || transaction_rows.actor_id || ')'
              ELSE transaction_rows.actor_id
            END AS actor_display
     FROM transaction_rows
     LEFT JOIN public.users users
       ON users.tenant_id = $1
      AND users.user_id = transaction_rows.actor_id
     WHERE transaction_rows.occurred_at IS NOT NULL
     ORDER BY transaction_rows.occurred_at DESC, transaction_rows.document_id DESC
     LIMIT 12`,
    [tenantId, warehouseId]
  );

  const trends = await client.query(
    `WITH days AS (
       SELECT (current_date - offset_value)::date AS day
       FROM generate_series(6, 0, -1) AS offset_value
     )
     SELECT
       to_char(days.day, 'Dy DD') AS label,
       (
         SELECT count(*)::int
         FROM public.asns
         WHERE tenant_id = $1
           AND warehouse_id = $2
           AND created_at >= days.day
           AND created_at < days.day + interval '1 day'
       ) + (
         SELECT count(*)::int
         FROM public.grns
         WHERE tenant_id = $1
           AND warehouse_id = $2
           AND created_at >= days.day
           AND created_at < days.day + interval '1 day'
       ) AS inbound,
       (
         SELECT count(*)::int
         FROM public.sales_orders
         WHERE tenant_id = $1
           AND warehouse_id = $2
           AND created_at >= days.day
           AND created_at < days.day + interval '1 day'
       ) + (
         SELECT count(*)::int
         FROM public.shipments
         WHERE tenant_id = $1
           AND warehouse_id = $2
           AND dispatched_at >= days.day
           AND dispatched_at < days.day + interval '1 day'
       ) AS outbound
     FROM days
     ORDER BY days.day`,
    [tenantId, warehouseId]
  );

  const inboundRow = inbound.rows[0] || {};
  const putawayMap = rowMap(putaway.rows);
  const inventoryRow = inventory.rows[0] || {};
  const pickingMap = rowMap(picking.rows);
  const shippingRow = shipping.rows[0] || {};
  const approvalsRow = approvals.rows[0] || {};
  const returnsRow = returns.rows[0] || {};
  const statusSummaryRow = statusSummary.rows[0] || {};

  const putawayAssigned = numberValue(putawayMap.get("assigned"));
  const putawayPending = numberValue(putawayMap.get("pending"));
  const putawayInProgress = numberValue(putawayMap.get("in_progress"));
  const putawayException = numberValue(putawayMap.get("exception"));
  const pickingOpen = numberValue(pickingMap.get("open"));
  const pickingAssigned = numberValue(pickingMap.get("assigned"));
  const pickingInProgress = countFrom(pickingMap, ["in_progress", "picking"]);
  const pickingPicked = countFrom(pickingMap, ["done", "completed", "picked"]);
  const cycleCountsSubmitted = numberValue(approvalsRow.cycle_counts_submitted);
  const adjustmentsSubmitted = numberValue(approvalsRow.adjustments_submitted);
  const returnCreated = numberValue(returnsRow.return_created);
  const rmaProcessing = numberValue(returnsRow.rma_processing);
  const openReturns = numberValue(returnsRow.open_returns);
  const activeRmas = numberValue(returnsRow.active_rmas);
  const returnsAwaitingClosure = numberValue(returnsRow.returns_awaiting_closure);
  const asnCreatedToday = numberValue(inboundRow.asn_created_today);
  const grnCreatedToday = numberValue(inboundRow.grn_created_today);
  const pendingInbound = numberValue(inboundRow.pending_inbound);
  const receivingInProgress = numberValue(inboundRow.receiving_in_progress);
  const activePacking = numberValue(statusSummaryRow.warehouse_active_packing);
  const readyToDispatch = numberValue(shippingRow.ready_to_dispatch);
  const dispatchedShipments = numberValue(shippingRow.dispatched);
  const closedShipments = numberValue(shippingRow.closed);

  return {
    generated_at: new Date().toISOString(),
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    kpis: {
      today_inbound: {
        asn_created_today: asnCreatedToday,
        grn_created_today: grnCreatedToday,
        total: asnCreatedToday + grnCreatedToday,
      },
      pending_putaway: {
        pending: putawayPending,
        assigned: putawayAssigned,
        in_progress: putawayInProgress,
        exception: putawayException,
        total: putawayPending + putawayAssigned + putawayInProgress + putawayException,
      },
      inventory: {
        on_hand: numberValue(inventoryRow.on_hand),
        reserved: numberValue(inventoryRow.reserved),
        available: numberValue(inventoryRow.available),
        quarantine: numberValue(inventoryRow.quarantine),
      },
      picking: {
        open: pickingOpen,
        assigned: pickingAssigned,
        in_progress: pickingInProgress,
        active: pickingOpen + pickingAssigned + pickingInProgress,
        picked: pickingPicked,
      },
      shipping: {
        ready_to_dispatch: readyToDispatch,
        dispatched: dispatchedShipments,
        closed: closedShipments,
        overdue: numberValue(shippingRow.overdue),
      },
      approvals: {
        cycle_counts_submitted: cycleCountsSubmitted,
        adjustments_submitted: adjustmentsSubmitted,
        total: cycleCountsSubmitted + adjustmentsSubmitted,
      },
      returns: {
        return_created: returnCreated,
        rma_processing: rmaProcessing,
        total_pending: returnCreated + rmaProcessing,
        open_returns: openReturns,
        active_rmas: activeRmas,
        returns_awaiting_closure: returnsAwaitingClosure,
      },
      operational: {
        pending_inbound: pendingInbound,
        receiving_in_progress: receivingInProgress,
        pending_putaway: putawayPending + putawayAssigned + putawayInProgress + putawayException,
        active_picking: pickingOpen + pickingAssigned + pickingInProgress,
        pending_packing: activePacking,
        shipments_ready_or_in_progress: readyToDispatch + dispatchedShipments,
        open_returns: openReturns,
        active_rmas: activeRmas,
      },
    },
    status_summary: {
      inbound: {
        pending_asn: numberValue(statusSummaryRow.inbound_pending_asn),
        in_transit_asn: numberValue(statusSummaryRow.inbound_in_transit_asn),
        arrived_asn: numberValue(statusSummaryRow.inbound_arrived_asn),
        receiving_grn: numberValue(statusSummaryRow.inbound_receiving_grn),
        completed_posted_grn: numberValue(statusSummaryRow.inbound_completed_posted_grn),
      },
      warehouse: {
        active_putaway: numberValue(statusSummaryRow.warehouse_active_putaway),
        active_picking: numberValue(statusSummaryRow.warehouse_active_picking),
        active_packing: numberValue(statusSummaryRow.warehouse_active_packing),
      },
      outbound: {
        ready_to_dispatch: numberValue(statusSummaryRow.outbound_ready_to_dispatch),
        dispatched: numberValue(statusSummaryRow.outbound_dispatched),
        closed: numberValue(statusSummaryRow.outbound_closed),
      },
      inventory: {
        submitted_cycle_counts: numberValue(statusSummaryRow.inventory_submitted_cycle_counts),
        submitted_adjustments: numberValue(statusSummaryRow.inventory_submitted_adjustments),
      },
    },
    pending_actions: pendingActions.rows.map((row) => ({
      module: row.module,
      document_id: row.document_id,
      status: row.raw_status,
      action_message: row.action_message,
      occurred_at: row.occurred_at,
      link: row.link,
      actor_display: row.actor_display || null,
    })),
    recent_transactions: recentTransactions.rows.map((row) => ({
      module: row.module,
      document_id: row.document_id,
      status: row.status,
      occurred_at: row.occurred_at,
      link: row.link,
      actor_display: row.actor_display || null,
    })),
    trends: {
      definition: "Inbound counts ASN and GRN documents created per local database day. Outbound counts Sales Orders created plus Shipments dispatched per local database day.",
      labels: trends.rows.map((row) => row.label),
      inbound: trends.rows.map((row) => numberValue(row.inbound)),
      outbound: trends.rows.map((row) => numberValue(row.outbound)),
    },
  };
}

export { getDashboardSummary, validateDashboardWarehouseAccess };
