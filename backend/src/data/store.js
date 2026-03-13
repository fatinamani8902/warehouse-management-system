const tenants = ["TNT000001", "TNT000002"];

const db = {
  users: [
    {
      user_id: "USR000001",
      user_name: "John Admin",
      role_id: "superadmin",
      tenant_id: "TNT000001",
      warehouse_ids: ["WH000001", "WH000002"],
      is_active: true,
    },
    {
      user_id: "USR000002",
      user_name: "Sarah Manager",
      role_id: "storemanager",
      tenant_id: "TNT000001",
      warehouse_ids: ["WH000001"],
      is_active: true,
    },
    {
      user_id: "USR000003",
      user_name: "Mike Operator",
      role_id: "storeoperator",
      tenant_id: "TNT000001",
      warehouse_ids: ["WH000001"],
      is_active: true,
    },
    {
      user_id: "USR000004",
      user_name: "Lisa Operator",
      role_id: "storeoperator",
      tenant_id: "TNT000001",
      warehouse_ids: ["WH000001"],
      is_active: true,
    },
    {
      user_id: "USR000005",
      user_name: "HQ Admin",
      role_id: "hqadmin",
      tenant_id: "TNT000001",
      warehouse_ids: ["WH000001", "WH000002"],
      is_active: true,
    },
    {
      user_id: "USR100001",
      user_name: "Tenant2 Manager",
      role_id: "storemanager",
      tenant_id: "TNT000002",
      warehouse_ids: ["WH000003"],
      is_active: true,
    },
  ],
  suppliers: [
    { supplier_id: "SUP000001", supplier_name: "Parts Global", is_active: true, tenant_id: "TNT000001" },
    { supplier_id: "SUP000002", supplier_name: "TechSupply Co", is_active: true, tenant_id: "TNT000001" },
    { supplier_id: "SUP000003", supplier_name: "Northwind Components", is_active: true, tenant_id: "TNT000001" },
    { supplier_id: "SUP000004", supplier_name: "GlobalTrade Supplier", is_active: true, tenant_id: "TNT000002" },
  ],
  asns: [
    {
      asn_id: "ASN000001",
      supplier_id: "SUP000001",
      supplier_name: "Parts Global",
      eta: "2026-02-12",
      status: "draft",
      lines_count: 3,
      notes: "Initial draft ASN",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      created_by: "USR000001",
      created_at: "2026-02-09T08:00:00.000Z",
      updated_at: "2026-02-09T08:00:00.000Z",
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
    },
    {
      asn_id: "ASN000002",
      supplier_id: "SUP000002",
      supplier_name: "TechSupply Co",
      eta: "2026-02-13",
      status: "pending",
      lines_count: 2,
      notes: "Pending dispatch",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      created_by: "USR000001",
      created_at: "2026-02-09T08:30:00.000Z",
      updated_at: "2026-02-09T08:30:00.000Z",
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
    },
    {
      asn_id: "ASN000003",
      supplier_id: "SUP000003",
      supplier_name: "Northwind Components",
      eta: "2026-02-14",
      status: "in_transit",
      lines_count: 1,
      notes: "Truck departed",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      created_by: "USR000002",
      created_at: "2026-02-08T11:10:00.000Z",
      updated_at: "2026-02-08T14:40:00.000Z",
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
    },
  ],
  grns: [
    {
      grn_id: "GRN000142",
      asn_id: null,
      supplier_id: "SUP000002",
      supplier_name: "TechSupply Co",
      received_date: "2026-02-08",
      status: "draft",
      notes: "Direct receipt",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      created_by: "USR000003",
      created_at: "2026-02-08T10:00:00.000Z",
      updated_at: "2026-02-08T10:00:00.000Z",
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      lines: [
        { line_no: 1, sku_id: "SKU000002", expected_qty: 10, received_qty: 10 },
      ],
    },
    {
      grn_id: "GRN000143",
      asn_id: "ASN000002",
      supplier_id: "SUP000002",
      supplier_name: "TechSupply Co",
      received_date: "2026-02-09",
      status: "receiving",
      notes: "Receiving from ASN000002",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      created_by: "USR000003",
      created_at: "2026-02-09T09:15:00.000Z",
      updated_at: "2026-02-09T09:15:00.000Z",
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      lines: [
        { line_no: 1, sku_id: "SKU000001", expected_qty: 500, received_qty: 500 },
        { line_no: 2, sku_id: "SKU000004", expected_qty: 200, received_qty: 200 },
      ],
    },
    {
      grn_id: "GRN000144",
      asn_id: "ASN000003",
      supplier_id: "SUP000003",
      supplier_name: "Northwind Components",
      received_date: "2026-02-09",
      status: "completed",
      notes: "Completed and ready to post",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      created_by: "USR000002",
      created_at: "2026-02-09T10:00:00.000Z",
      updated_at: "2026-02-09T11:00:00.000Z",
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      lines: [
        { line_no: 1, sku_id: "SKU000003", expected_qty: 30, received_qty: 30 },
      ],
    },
  ],

  orders: [],

  skus: [
    {
      sku_id: "SKU000001",
      description: "Industrial Bearing 6205",
      uom_id: "EA",
      epc_value: "EPC:300833B2DDD9014000000001",
    },
    {
      sku_id: "SKU000002",
      description: "Hydraulic Pump HP-200",
      uom_id: "EA",
      epc_value: "EPC:300833B2DDD9014000000002",
    },
    {
      sku_id: "SKU000003",
      description: "Lithium Battery Pack LB-12",
      uom_id: "EA",
      epc_value: "EPC:300833B2DDD9014000000003",
    },
    {
      sku_id: "SKU000004",
      description: "Steel Fastener M10x50",
      uom_id: "BOX",
      epc_value: "EPC:300833B2DDD9014000000004",
    },
    {
      sku_id: "SKU000005",
      description: "Safety Gloves SG-XL",
      uom_id: "PAIR",
      epc_value: "EPC:300833B2DDD9014000000005",
    },
    {
      sku_id: "SKU900001",
      description: "Demo Item Tenant2",
      uom_id: "EA",
      epc_value: "EPC:300833B2DDD9014000090001",
    },
  ],
  inventory_zones: [
    { zone_id: "ZN001", zone_name: "Receiving Dock", zone_type: "dock", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { zone_id: "ZN002", zone_name: "Bulk Storage A", zone_type: "storage", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { zone_id: "ZN003", zone_name: "Pick Area B", zone_type: "storage", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { zone_id: "ZN006", zone_name: "Quarantine", zone_type: "quarantine", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { zone_id: "ZN901", zone_name: "Tenant2 Storage", zone_type: "storage", tenant_id: "TNT000002", warehouse_id: "WH000003" },
  ],
  inventory_locations: [
    { location_id: "LOC000001", location_code: "A-01-001", zone_id: "ZN002", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { location_id: "LOC000002", location_code: "A-01-002", zone_id: "ZN002", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { location_id: "LOC000003", location_code: "B-02-001", zone_id: "ZN003", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { location_id: "LOC000004", location_code: "C-01-001", zone_id: "ZN003", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { location_id: "LOC000006", location_code: "Q-01-001", zone_id: "ZN006", tenant_id: "TNT000001", warehouse_id: "WH000001" },
    { location_id: "LOC100001", location_code: "C-01-001", zone_id: "ZN901", tenant_id: "TNT000002", warehouse_id: "WH000003" },
  ],
  inventory_reason_codes: [
    { reason_code: "DAMAGED", reason_name: "Damaged", tenant_id: "TNT000001" },
    { reason_code: "MISCOUNTED", reason_name: "Miscounted", tenant_id: "TNT000001" },
    { reason_code: "QUALITY_HOLD", reason_name: "Quality Hold", tenant_id: "TNT000001" },
    { reason_code: "SYSTEM_ERROR", reason_name: "System Error", tenant_id: "TNT000001" },
    { reason_code: "CYCLE_VARIANCE", reason_name: "Cycle Count Variance", tenant_id: "TNT000001" },
    { reason_code: "DAMAGED", reason_name: "Damaged", tenant_id: "TNT000002" },
    { reason_code: "MISCOUNTED", reason_name: "Miscounted", tenant_id: "TNT000002" },
  ],
  inventory_configs: [
    {
      tenant_id: "TNT000001",
      variance_threshold_mode: "percent",
      variance_threshold_percent: 5,
      variance_threshold_abs: 10,
    },
    {
      tenant_id: "TNT000002",
      variance_threshold_mode: "absolute",
      variance_threshold_percent: 5,
      variance_threshold_abs: 3,
    },
  ],
  inventory_transactions: [
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000001",
      txn_type: "RECEIVE",
      sku_id: "SKU000001",
      qty: 1200,
      uom_id: "EA",
      from_location_id: null,
      to_location_id: "LOC000001",
      reference_type: "GRN",
      reference_id: "GRN000143",
      reason_code: null,
      created_at: "2026-02-08T08:00:00.000Z",
      created_by: "USR000002",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000002",
      txn_type: "RESERVE",
      sku_id: "SKU000001",
      qty: 150,
      uom_id: "EA",
      from_location_id: null,
      to_location_id: "LOC000001",
      reference_type: "SO",
      reference_id: "SO000120",
      reason_code: null,
      created_at: "2026-02-08T08:30:00.000Z",
      created_by: "USR000002",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000003",
      txn_type: "RECEIVE",
      sku_id: "SKU000002",
      qty: 35,
      uom_id: "EA",
      from_location_id: null,
      to_location_id: "LOC000002",
      reference_type: "GRN",
      reference_id: "GRN000142",
      reason_code: null,
      created_at: "2026-02-08T09:00:00.000Z",
      created_by: "USR000003",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000004",
      txn_type: "RESERVE",
      sku_id: "SKU000002",
      qty: 5,
      uom_id: "EA",
      from_location_id: null,
      to_location_id: "LOC000002",
      reference_type: "SO",
      reference_id: "SO000121",
      reason_code: null,
      created_at: "2026-02-08T09:15:00.000Z",
      created_by: "USR000003",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000005",
      txn_type: "RECEIVE",
      sku_id: "SKU000003",
      qty: 180,
      uom_id: "EA",
      from_location_id: null,
      to_location_id: "LOC000003",
      reference_type: "GRN",
      reference_id: "GRN000144",
      reason_code: null,
      created_at: "2026-02-08T09:30:00.000Z",
      created_by: "USR000002",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000006",
      txn_type: "RESERVE",
      sku_id: "SKU000003",
      qty: 20,
      uom_id: "EA",
      from_location_id: null,
      to_location_id: "LOC000003",
      reference_type: "SO",
      reference_id: "SO000122",
      reason_code: null,
      created_at: "2026-02-08T09:45:00.000Z",
      created_by: "USR000002",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000007",
      txn_type: "QUARANTINE_MOVE",
      sku_id: "SKU000003",
      qty: 10,
      uom_id: "EA",
      from_location_id: "LOC000003",
      to_location_id: "LOC000006",
      reference_type: "MANUAL",
      reference_id: "MOVE000001",
      reason_code: "QUALITY_HOLD",
      created_at: "2026-02-08T10:00:00.000Z",
      created_by: "USR000002",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000008",
      txn_type: "RECEIVE",
      sku_id: "SKU000004",
      qty: 450,
      uom_id: "BOX",
      from_location_id: null,
      to_location_id: "LOC000001",
      reference_type: "GRN",
      reference_id: "GRN000143",
      reason_code: null,
      created_at: "2026-02-08T10:30:00.000Z",
      created_by: "USR000003",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000009",
      txn_type: "RESERVE",
      sku_id: "SKU000004",
      qty: 100,
      uom_id: "BOX",
      from_location_id: null,
      to_location_id: "LOC000001",
      reference_type: "SO",
      reference_id: "SO000123",
      reason_code: null,
      created_at: "2026-02-08T10:45:00.000Z",
      created_by: "USR000003",
    },
    {
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      txn_id: "ITX000010",
      txn_type: "RECEIVE",
      sku_id: "SKU000005",
      qty: 500,
      uom_id: "PAIR",
      from_location_id: null,
      to_location_id: "LOC000006",
      reference_type: "MANUAL",
      reference_id: "INIT000001",
      reason_code: null,
      created_at: "2026-02-08T11:00:00.000Z",
      created_by: "USR000002",
    },
    {
      tenant_id: "TNT000002",
      warehouse_id: "WH000003",
      txn_id: "ITX000011",
      txn_type: "RECEIVE",
      sku_id: "SKU900001",
      qty: 50,
      uom_id: "EA",
      from_location_id: null,
      to_location_id: "LOC100001",
      reference_type: "GRN",
      reference_id: "GRN100001",
      reason_code: null,
      created_at: "2026-02-08T08:00:00.000Z",
      created_by: "USR100001",
    },
  ],
  count_plans: [
    {
      count_id: "CC000014",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      zone_id: "ZN003",
      planned_date: "2026-02-07",
      status: "APPROVED",
      scope_type: "FULL_ZONE",
      created_at: "2026-02-07T08:00:00.000Z",
      created_by: "USR000002",
      submitted_at: "2026-02-07T09:00:00.000Z",
      submitted_by: "USR000002",
      approved_at: "2026-02-07T09:30:00.000Z",
      approved_by: "USR000001",
      approval_note: "Approved within threshold",
      cancellation_reason: null,
      requires_approval: false,
    },
    {
      count_id: "CC000015",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      zone_id: "ZN002",
      planned_date: "2026-02-09",
      status: "IN_PROGRESS",
      scope_type: "FULL_ZONE",
      created_at: "2026-02-09T08:30:00.000Z",
      created_by: "USR000002",
      submitted_at: null,
      submitted_by: null,
      approved_at: null,
      approved_by: null,
      approval_note: null,
      cancellation_reason: null,
      requires_approval: true,
    },
  ],
  count_plan_lines: [
    {
      line_id: "CCL000001",
      count_id: "CC000014",
      tenant_id: "TNT000001",
      sku_id: "SKU000002",
      location_id: "LOC000002",
      system_qty: 35,
      counted_qty: 35,
      variance_qty: 0,
      status: "APPROVED",
    },
    {
      line_id: "CCL000002",
      count_id: "CC000015",
      tenant_id: "TNT000001",
      sku_id: "SKU000001",
      location_id: "LOC000001",
      system_qty: 1200,
      counted_qty: 1195,
      variance_qty: -5,
      status: "COUNTED",
    },
    {
      line_id: "CCL000003",
      count_id: "CC000015",
      tenant_id: "TNT000001",
      sku_id: "SKU000004",
      location_id: "LOC000001",
      system_qty: 450,
      counted_qty: null,
      variance_qty: null,
      status: "PENDING",
    },
  ],
  count_entries: [
    {
      entry_id: "CCE000001",
      tenant_id: "TNT000001",
      count_id: "CC000015",
      line_id: "CCL000002",
      scan_mode: "MANUAL",
      scanned_value: "SKU000001",
      qty_counted: 1195,
      qty_delta: -5,
      scanned_at: "2026-02-09T10:00:00.000Z",
      scanned_by: "USR000003",
    },
  ],
  adjustment_requests: [
    {
      adj_id: "ADJ000005",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      status: "APPROVED",
      sku_id: "SKU000005",
      location_id: "LOC000006",
      qty_delta: 500,
      reason_code: "QUALITY_HOLD",
      requested_by: "USR000002",
      requested_at: "2026-02-07T10:00:00.000Z",
      approved_by: "USR000001",
      approved_at: "2026-02-07T10:10:00.000Z",
      approval_note: "Approved quality hold stock",
      cancellation_reason: null,
    },
    {
      adj_id: "ADJ000006",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      status: "SUBMITTED",
      sku_id: "SKU000003",
      location_id: "LOC000003",
      qty_delta: -3,
      reason_code: "DAMAGED",
      requested_by: "USR000003",
      requested_at: "2026-02-09T12:00:00.000Z",
      approved_by: null,
      approved_at: null,
      approval_note: null,
      cancellation_reason: null,
    },
  ],
  putaway_tasks: [
    {
      task_id: "PUT000210",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      grn_id: "GRN000143",
      sku_id: "SKU000001",
      qty: 480,
      source_location: "DOCK-1",
      suggested_bin: "A-01-001",
      actual_bin_code: null,
      priority: "high",
      status: "pending",
      assigned_to_user_id: null,
      assigned_to_user_name: null,
      started_at: null,
      completed_at: null,
      device_type: null,
      scan_method: null,
      epc_expected_count: null,
      epc_confirmed_count: null,
      validation_result: null,
      exception_reason: null,
      created_at: "2026-02-09T10:00:00.000Z",
      updated_at: "2026-02-09T10:00:00.000Z",
      updated_by: "USR000003",
    },
    {
      task_id: "PUT000211",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      grn_id: "GRN000143",
      sku_id: "SKU000004",
      qty: 200,
      source_location: "DOCK-1",
      suggested_bin: "A-01-002",
      actual_bin_code: "A-01-003",
      priority: "medium",
      status: "in_progress",
      assigned_to_user_id: "USR000003",
      assigned_to_user_name: "Mike Operator",
      started_at: "2026-02-09T10:05:00.000Z",
      completed_at: null,
      device_type: "Android RFID",
      scan_method: "rfid",
      epc_expected_count: 200,
      epc_confirmed_count: 200,
      validation_result: "passed",
      exception_reason: null,
      created_at: "2026-02-09T10:05:00.000Z",
      updated_at: "2026-02-09T10:10:00.000Z",
      updated_by: "USR000003",
    },
    {
      task_id: "PUT000212",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      grn_id: "GRN000142",
      sku_id: "SKU000002",
      qty: 10,
      source_location: "DOCK-2",
      suggested_bin: "B-02-001",
      actual_bin_code: "B-02-001",
      priority: "low",
      status: "completed",
      assigned_to_user_id: "USR000004",
      assigned_to_user_name: "Lisa Operator",
      started_at: "2026-02-08T14:00:00.000Z",
      completed_at: "2026-02-08T14:15:00.000Z",
      device_type: "Android QR",
      scan_method: "qr",
      epc_expected_count: 10,
      epc_confirmed_count: 10,
      validation_result: "passed",
      exception_reason: null,
      created_at: "2026-02-08T14:00:00.000Z",
      updated_at: "2026-02-08T14:15:00.000Z",
      updated_by: "USR000004",
    },
    {
      task_id: "PUT000213",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      grn_id: "GRN000144",
      sku_id: "SKU000003",
      qty: 30,
      source_location: "DOCK-1",
      suggested_bin: "Q-01-001",
      actual_bin_code: "Q-01-002",
      priority: "high",
      status: "exception",
      assigned_to_user_id: "USR000003",
      assigned_to_user_name: "Mike Operator",
      started_at: "2026-02-09T11:30:00.000Z",
      completed_at: null,
      device_type: "Android RFID",
      scan_method: "rfid",
      epc_expected_count: 30,
      epc_confirmed_count: 27,
      validation_result: "failed",
      exception_reason: "Count mismatch after verification",
      created_at: "2026-02-09T11:25:00.000Z",
      updated_at: "2026-02-09T11:40:00.000Z",
      updated_by: "USR000003",
    },
    {
      task_id: "PUT000310",
      tenant_id: "TNT000002",
      warehouse_id: "WH000003",
      grn_id: "GRN100001",
      sku_id: "SKU900001",
      qty: 50,
      source_location: "DOCK-1",
      suggested_bin: "C-01-001",
      actual_bin_code: null,
      priority: "medium",
      status: "pending",
      assigned_to_user_id: null,
      assigned_to_user_name: null,
      started_at: null,
      completed_at: null,
      device_type: null,
      scan_method: null,
      epc_expected_count: null,
      epc_confirmed_count: null,
      validation_result: null,
      exception_reason: null,
      created_at: "2026-02-09T09:15:00.000Z",
      updated_at: "2026-02-09T09:15:00.000Z",
      updated_by: "USR100001",
    },
  ],
  putaway_task_events: [
    {
      event_id: "PUTEVT000001",
      tenant_id: "TNT000001",
      task_id: "PUT000210",
      event_type: "created",
      event_payload: { status: "pending", suggested_bin: "A-01-001" },
      created_by: "USR000003",
      created_at: "2026-02-09T10:00:00.000Z",
    },
    {
      event_id: "PUTEVT000002",
      tenant_id: "TNT000001",
      task_id: "PUT000211",
      event_type: "assigned",
      event_payload: { assigned_to_user_id: "USR000003", assigned_to_user_name: "Mike Operator" },
      created_by: "USR000002",
      created_at: "2026-02-09T10:06:00.000Z",
    },
    {
      event_id: "PUTEVT000003",
      tenant_id: "TNT000001",
      task_id: "PUT000211",
      event_type: "started",
      event_payload: { started_at: "2026-02-09T10:05:00.000Z", device_type: "Android RFID", scan_method: "rfid" },
      created_by: "USR000003",
      created_at: "2026-02-09T10:10:00.000Z",
    },
    {
      event_id: "PUTEVT000004",
      tenant_id: "TNT000001",
      task_id: "PUT000212",
      event_type: "completed",
      event_payload: {
        completed_at: "2026-02-08T14:15:00.000Z",
        validation_result: "passed",
        epc_expected_count: 10,
        epc_confirmed_count: 10,
      },
      created_by: "USR000004",
      created_at: "2026-02-08T14:15:00.000Z",
    },
    {
      event_id: "PUTEVT000005",
      tenant_id: "TNT000001",
      task_id: "PUT000213",
      event_type: "exception",
      event_payload: { reason: "Count mismatch after verification" },
      created_by: "USR000003",
      created_at: "2026-02-09T11:40:00.000Z",
    },
  ],
  pick_lists: [
    {
      pick_list_id: "PCK000077",
      wave_id: "WAV000012",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      assigned_to_user_id: "USR000003",
      assigned_to_user_name: "Mike Operator",
      status: "picking",
      created_at: "2026-02-09T11:00:00.000Z",
      started_at: "2026-02-09T11:05:00.000Z",
      completed_at: null,
      updated_at: "2026-02-09T11:20:00.000Z",
      updated_by: "USR000003",
      lines: [
        { line_no: 1, sku_id: "SKU000001", location_id: "LOC000001", qty_required: 50, qty_picked: 30, status: "picking" },
        { line_no: 2, sku_id: "SKU000004", location_id: "LOC000001", qty_required: 20, qty_picked: 0, status: "pending" },
      ],
    },
    {
      pick_list_id: "PCK000076",
      wave_id: "WAV000011",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      assigned_to_user_id: "USR000003",
      assigned_to_user_name: "Mike Operator",
      status: "completed",
      created_at: "2026-02-08T09:00:00.000Z",
      started_at: "2026-02-08T09:05:00.000Z",
      completed_at: "2026-02-08T14:50:00.000Z",
      updated_at: "2026-02-08T14:50:00.000Z",
      updated_by: "USR000003",
      lines: [
        { line_no: 1, sku_id: "SKU000002", location_id: "LOC000002", qty_required: 5, qty_picked: 5, status: "picked" },
      ],
    },
    {
      pick_list_id: "PCK100001",
      wave_id: "WAV100001",
      tenant_id: "TNT000002",
      warehouse_id: "WH000003",
      assigned_to_user_id: "USR100001",
      assigned_to_user_name: "Tenant2 Manager",
      status: "completed",
      created_at: "2026-02-08T08:30:00.000Z",
      started_at: "2026-02-08T08:45:00.000Z",
      completed_at: "2026-02-08T09:30:00.000Z",
      updated_at: "2026-02-08T09:30:00.000Z",
      updated_by: "USR100001",
      lines: [
        { line_no: 1, sku_id: "SKU900001", location_id: "LOC100001", qty_required: 4, qty_picked: 4, status: "picked" },
      ],
    },
  ],
  pack_orders: [
    {
      pack_id: "PAK000033",
      pick_list_id: "PCK000076",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      carton_id: "CTN000091",
      packaging_type: "standard_box",
      weight_kg: 78.5,
      status: "packed",
      label_generated_at: "2026-02-08T14:55:00.000Z",
      packed_at: "2026-02-08T15:00:00.000Z",
      created_at: "2026-02-08T14:50:00.000Z",
      created_by: "USR000003",
      updated_at: "2026-02-08T15:00:00.000Z",
      updated_by: "USR000003",
    },
    {
      pack_id: "PAK000034",
      pick_list_id: "PCK000077",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      carton_id: null,
      packaging_type: null,
      weight_kg: null,
      status: "draft",
      label_generated_at: null,
      packed_at: null,
      created_at: "2026-02-09T11:30:00.000Z",
      created_by: "USR000002",
      updated_at: "2026-02-09T11:30:00.000Z",
      updated_by: "USR000002",
    },
    {
      pack_id: "PAK100001",
      pick_list_id: "PCK100001",
      tenant_id: "TNT000002",
      warehouse_id: "WH000003",
      carton_id: "CTN100001",
      packaging_type: "pallet_wrap",
      weight_kg: 20.2,
      status: "carton_generated",
      label_generated_at: "2026-02-08T09:45:00.000Z",
      packed_at: null,
      created_at: "2026-02-08T09:40:00.000Z",
      created_by: "USR100001",
      updated_at: "2026-02-08T09:45:00.000Z",
      updated_by: "USR100001",
    },
  ],
  lov_packaging_types: [
    { value: "standard_box", label: "Standard Box", tenant_id: "TNT000001", is_active: true },
    { value: "pallet_wrap", label: "Pallet Wrap", tenant_id: "TNT000001", is_active: true },
    { value: "bubble_wrap", label: "Bubble Wrap", tenant_id: "TNT000001", is_active: true },
    { value: "crate", label: "Crate", tenant_id: "TNT000001", is_active: true },
    { value: "envelope", label: "Envelope", tenant_id: "TNT000001", is_active: true },
    { value: "standard_box", label: "Standard Box", tenant_id: "TNT000002", is_active: true },
    { value: "pallet_wrap", label: "Pallet Wrap", tenant_id: "TNT000002", is_active: true },
  ],
  shipments: [
    {
      shipment_id: "SHP000031",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      pack_ids: ["PAK000033"],
      customer_id: "CUS000001",
      customer_name: "RetailMax",
      carrier: "FedEx Ground",
      tracking_no: "FX123456789",
      status: "dispatched",
      ship_by: "2026-02-08T16:00:00.000Z",
      dispatch_due_at: "2026-02-08T16:00:00.000Z",
      dispatched_at: "2026-02-08T17:00:00.000Z",
      created_at: "2026-02-08T14:55:00.000Z",
      created_by: "USR000002",
      updated_at: "2026-02-08T17:00:00.000Z",
      updated_by: "USR000002",
    },
    {
      shipment_id: "SHP000030",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      pack_ids: [],
      customer_id: "CUS000002",
      customer_name: "BuildRight Co",
      carrier: "UPS Standard",
      tracking_no: null,
      status: "pending",
      ship_by: "2026-02-08T12:00:00.000Z",
      dispatch_due_at: "2026-02-08T12:00:00.000Z",
      dispatched_at: null,
      created_at: "2026-02-08T10:20:00.000Z",
      created_by: "USR000003",
      updated_at: "2026-02-08T10:20:00.000Z",
      updated_by: "USR000003",
    },
    {
      shipment_id: "SHP000032",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      pack_ids: ["PAK000034"],
      customer_id: "CUS000003",
      customer_name: "Northline Stores",
      carrier: "DHL Express",
      tracking_no: null,
      status: "packed",
      ship_by: "2026-02-10T10:00:00.000Z",
      dispatch_due_at: "2026-02-10T10:00:00.000Z",
      dispatched_at: null,
      created_at: "2026-02-09T12:00:00.000Z",
      created_by: "USR000002",
      updated_at: "2026-02-09T12:10:00.000Z",
      updated_by: "USR000002",
    },
    {
      shipment_id: "SHP100001",
      tenant_id: "TNT000002",
      warehouse_id: "WH000003",
      pack_ids: ["PAK100001"],
      customer_id: "CUS100001",
      customer_name: "Tenant2 Retail",
      carrier: "FedEx International",
      tracking_no: null,
      status: "pending",
      ship_by: "2026-02-09T12:00:00.000Z",
      dispatch_due_at: "2026-02-09T12:00:00.000Z",
      dispatched_at: null,
      created_at: "2026-02-09T09:15:00.000Z",
      created_by: "USR100001",
      updated_at: "2026-02-09T09:15:00.000Z",
      updated_by: "USR100001",
    },
  ],
  returns: [
    {
      return_id: "RTN000001",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      shipment_id: "SHP000031",
      customer_id: "CUS000001",
      customer_name: "RetailMax",
      sku_id: "SKU000002",
      qty: 1,
      reason_code: "defective",
      reason_description: "Defective unit",
      notes: "Customer reported a defect during unpacking.",
      status: "created",
      created_at: "2026-02-09T09:00:00.000Z",
      created_by: "USR000003",
      updated_at: "2026-02-09T09:00:00.000Z",
      cancellation_reason_code: null,
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      received_at: null,
      closed_at: null,
    },
    {
      return_id: "RTN000002",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      shipment_id: "SHP000030",
      customer_id: "CUS000002",
      customer_name: "BuildRight Co",
      sku_id: "SKU000004",
      qty: 2,
      reason_code: "wrong_item",
      reason_description: "Wrong item shipped",
      notes: "",
      status: "new",
      created_at: "2026-02-09T10:30:00.000Z",
      created_by: "USR000002",
      updated_at: "2026-02-09T10:30:00.000Z",
      cancellation_reason_code: null,
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      received_at: null,
      closed_at: null,
    },
  ],
  rmas: [
    {
      rma_id: "RMA000001",
      tenant_id: "TNT000001",
      return_id: "RTN000001",
      status: "created",
      notes: "Initial RMA for defective return.",
      created_at: "2026-02-09T09:10:00.000Z",
      created_by: "USR000003",
      updated_at: "2026-02-09T09:10:00.000Z",
      cancellation_reason_code: null,
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      closed_at: null,
    },
  ],
  rma_items: [
    {
      rma_item_id: "RMI000001",
      rma_id: "RMA000001",
      tenant_id: "TNT000001",
      sku_id: "SKU000002",
      qty: 1,
      reason_code: "defective",
    },
  ],
  audit_logs: [],
  trace_events: [
    {
      event_id: "TRC000001",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Receiving Dock",
      bin_code: "DOCK-1",
      event_type: "received",
      sku_id: "SKU000001",
      epc: "EPC:300833B2DDD9014000000001",
      qr_payload: "QR:SKU000001:LOT2026A",
      reference_type: "GRN",
      reference_id: "GRN000143",
      performed_by: "USR000003",
      performed_by_type: "user",
      source_channel: "mobile_app",
      message: "Item received at dock",
      timestamp: "2026-02-09T09:30:00.000Z",
    },
    {
      event_id: "TRC000002",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Bulk Storage A",
      bin_code: "A-01-001",
      event_type: "putaway",
      sku_id: "SKU000001",
      epc: "EPC:300833B2DDD9014000000001",
      qr_payload: "QR:SKU000001:LOT2026A",
      reference_type: "PUT",
      reference_id: "PUT000210",
      performed_by: "HANDHELD-RFID-01",
      performed_by_type: "device",
      source_channel: "rfid_gate",
      message: "Putaway completed",
      timestamp: "2026-02-09T10:30:00.000Z",
    },
    {
      event_id: "TRC000003",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Picking",
      bin_code: "A-01-001",
      event_type: "picked",
      sku_id: "SKU000001",
      epc: "EPC:300833B2DDD9014000000001",
      qr_payload: "QR:SKU000001:LOT2026A",
      reference_type: "DO",
      reference_id: "DO000077",
      performed_by: "USR000003",
      performed_by_type: "user",
      source_channel: "mobile_app",
      message: "Item picked for outbound",
      timestamp: "2026-02-09T11:30:00.000Z",
    },
    {
      event_id: "TRC000004",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Shipping",
      bin_code: "SHP-DOCK-2",
      event_type: "shipped",
      sku_id: "SKU000001",
      epc: "EPC:300833B2DDD9014000000001",
      qr_payload: "QR:SKU000001:LOT2026A",
      reference_type: "DO",
      reference_id: "DO000077",
      performed_by: "SYSTEM-WCS",
      performed_by_type: "system",
      source_channel: "api",
      message: "Dispatch confirmed to carrier",
      timestamp: "2026-02-09T12:10:00.000Z",
    },
    {
      event_id: "TRC000005",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Receiving Dock",
      bin_code: "DOCK-2",
      event_type: "received",
      sku_id: "SKU000002",
      epc: "EPC:300833B2DDD9014000000002",
      qr_payload: "QR:SKU000002:SN-HP200-0042",
      reference_type: "GRN",
      reference_id: "GRN000142",
      performed_by: "RFID-GATE-02",
      performed_by_type: "device",
      source_channel: "rfid_gate",
      message: "Inbound gate read successful",
      timestamp: "2026-02-08T13:00:00.000Z",
    },
    {
      event_id: "TRC000006",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Bulk Storage B",
      bin_code: "B-02-001",
      event_type: "putaway",
      sku_id: "SKU000002",
      epc: "EPC:300833B2DDD9014000000002",
      qr_payload: "QR:SKU000002:SN-HP200-0042",
      reference_type: "PUT",
      reference_id: "PUT000209",
      performed_by: "USR000004",
      performed_by_type: "user",
      source_channel: "mobile_app",
      message: "Putaway confirmed by operator",
      timestamp: "2026-02-08T14:30:00.000Z",
    },
    {
      event_id: "TRC000007",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Returns Dock",
      bin_code: "RET-01",
      event_type: "returned",
      sku_id: "SKU000002",
      epc: "EPC:300833B2DDD9014000000002",
      qr_payload: "QR:SKU000002:SN-HP200-0042",
      reference_type: "RMA",
      reference_id: "RMA000001",
      performed_by: "USR000003",
      performed_by_type: "user",
      source_channel: "mobile_app",
      message: "Customer return received",
      timestamp: "2026-02-09T09:00:00.000Z",
    },
    {
      event_id: "TRC000008",
      tenant_id: "TNT000001",
      warehouse_id: "WH000001",
      warehouse_name: "Main Distribution Center",
      zone_code: "Quality Hold",
      bin_code: "Q-01-001",
      event_type: "putaway",
      sku_id: "SKU000005",
      epc: "EPC:300833B2DDD9014000000005",
      qr_payload: "QR:SKU000005:QH-2026",
      reference_type: "ADJ",
      reference_id: "ADJ000005",
      performed_by: "CABINET-01",
      performed_by_type: "device",
      source_channel: "rfid_cabinet",
      message: "Moved to quarantine cabinet",
      timestamp: "2026-02-07T10:00:00.000Z",
    },
    {
      event_id: "TRC000009",
      tenant_id: "TNT000001",
      warehouse_id: "WH000002",
      warehouse_name: "Overflow Warehouse",
      zone_code: "Receiving",
      bin_code: "OVR-DOCK-1",
      event_type: "received",
      sku_id: "SKU000003",
      epc: "EPC:300833B2DDD9014000000003",
      qr_payload: "QR:SKU000003:LOT-OVR",
      reference_type: "ASN",
      reference_id: "ASN000003",
      performed_by: "USR000005",
      performed_by_type: "user",
      source_channel: "mobile_app",
      message: "Overflow receipt",
      timestamp: "2026-02-08T11:10:00.000Z",
    },
    {
      event_id: "TRC000010",
      tenant_id: "TNT000002",
      warehouse_id: "WH000003",
      warehouse_name: "Tenant2 Warehouse",
      zone_code: "Receiving",
      bin_code: "C-01-001",
      event_type: "received",
      sku_id: "SKU900001",
      epc: "EPC:300833B2DDD9014000090001",
      qr_payload: "QR:SKU900001:LOT-A",
      reference_type: "GRN",
      reference_id: "GRN100001",
      performed_by: "USR100001",
      performed_by_type: "user",
      source_channel: "mobile_app",
      message: "Tenant2 inbound receipt",
      timestamp: "2026-02-08T08:00:00.000Z",
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function extractNumericId(value, prefix) {
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  const match = regex.exec(value || "");
  return match ? Number(match[1]) : 0;
}

function getMaxId(list, key, prefix) {
  return list.reduce((max, item) => {
    const candidate = extractNumericId(item[key], prefix);
    return candidate > max ? candidate : max;
  }, 0);
}

const sequenceCounters = {
  SUP: getMaxId(db.suppliers, "supplier_id", "SUP"),
  ASN: getMaxId(db.asns, "asn_id", "ASN"),
  GRN: getMaxId(db.grns, "grn_id", "GRN"),
  ITX: getMaxId(db.inventory_transactions, "txn_id", "ITX"),
  CC: getMaxId(db.count_plans, "count_id", "CC"),
  CCL: getMaxId(db.count_plan_lines, "line_id", "CCL"),
  CCE: getMaxId(db.count_entries, "entry_id", "CCE"),
  ADJ: getMaxId(db.adjustment_requests, "adj_id", "ADJ"),
  PUT: getMaxId(db.putaway_tasks, "task_id", "PUT"),
  PUTEVT: getMaxId(db.putaway_task_events, "event_id", "PUTEVT"),
  PCK: getMaxId(db.pick_lists, "pick_list_id", "PCK"),
  PAK: getMaxId(db.pack_orders, "pack_id", "PAK"),
  CTN: getMaxId(db.pack_orders, "carton_id", "CTN"),
  SHP: getMaxId(db.shipments, "shipment_id", "SHP"),
  RTN: getMaxId(db.returns, "return_id", "RTN"),
  RMA: getMaxId(db.rmas, "rma_id", "RMA"),
  RMI: getMaxId(db.rma_items, "rma_item_id", "RMI"),
  AUD: getMaxId(db.audit_logs, "audit_id", "AUD"),
  TRC: getMaxId(db.trace_events, "event_id", "TRC"),
};

function nextPrefixedId(prefix, padLength = 6) {
  sequenceCounters[prefix] = (sequenceCounters[prefix] || 0) + 1;
  return `${prefix}${String(sequenceCounters[prefix]).padStart(padLength, "0")}`;
}

function isKnownTenant(tenantId) {
  return tenants.includes(tenantId);
}

function listSuppliers(tenantId) {
  return clone(
    db.suppliers
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => a.supplier_id.localeCompare(b.supplier_id)),
  );
}

function getSupplier(tenantId, supplierId) {
  return db.suppliers.find((item) => item.tenant_id === tenantId && item.supplier_id === supplierId) || null;
}

function createSupplier(tenantId, supplierName, isActive = true) {
  const supplier = {
    supplier_id: nextPrefixedId("SUP"),
    supplier_name: supplierName,
    is_active: Boolean(isActive),
    tenant_id: tenantId,
  };
  db.suppliers.push(supplier);
  return clone(supplier);
}

function updateSupplier(tenantId, supplierId, payload) {
  const idx = db.suppliers.findIndex((item) => item.tenant_id === tenantId && item.supplier_id === supplierId);
  if (idx < 0) {
    return null;
  }

  db.suppliers[idx] = {
    ...db.suppliers[idx],
    supplier_name: payload.supplier_name ?? db.suppliers[idx].supplier_name,
    is_active: payload.is_active === undefined ? db.suppliers[idx].is_active : Boolean(payload.is_active),
  };

  const supplier = db.suppliers[idx];
  db.asns = db.asns.map((item) =>
    item.tenant_id === tenantId && item.supplier_id === supplierId
      ? { ...item, supplier_name: supplier.supplier_name }
      : item,
  );
  db.grns = db.grns.map((item) =>
    item.tenant_id === tenantId && item.supplier_id === supplierId
      ? { ...item, supplier_name: supplier.supplier_name }
      : item,
  );

  return clone(supplier);
}

function deleteSupplier(tenantId, supplierId) {
  const idx = db.suppliers.findIndex((item) => item.tenant_id === tenantId && item.supplier_id === supplierId);
  if (idx < 0) {
    return false;
  }

  db.suppliers.splice(idx, 1);
  return true;
}

function listAsns(tenantId) {
  return clone(
    db.asns
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => b.asn_id.localeCompare(a.asn_id)),
  );
}

function getAsn(tenantId, asnId) {
  return db.asns.find((item) => item.tenant_id === tenantId && item.asn_id === asnId) || null;
}

function createAsn({ tenantId, warehouseId, userId, supplierId, eta, notes, linesCount }) {
  const supplier = getSupplier(tenantId, supplierId);
  if (!supplier) {
    return { error: "Supplier not found" };
  }

  if (!supplier.is_active) {
    return { error: "Supplier is inactive" };
  }

  const now = new Date().toISOString();
  const asn = {
    asn_id: nextPrefixedId("ASN"),
    supplier_id: supplier.supplier_id,
    supplier_name: supplier.supplier_name,
    eta: eta || now.slice(0, 10),
    status: "draft",
    lines_count: Number(linesCount || 0),
    notes: notes || "",
    tenant_id: tenantId,
    warehouse_id: warehouseId || null,
    created_by: userId,
    created_at: now,
    updated_at: now,
    cancellation_reason: null,
    cancelled_by: null,
    cancelled_at: null,
  };

  db.asns.push(asn);
  return { data: clone(asn) };
}

function listGrns(tenantId) {
  return clone(
    db.grns
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => b.grn_id.localeCompare(a.grn_id)),
  );
}

function getGrn(tenantId, grnId) {
  return db.grns.find((item) => item.tenant_id === tenantId && item.grn_id === grnId) || null;
}

function defaultLinesFromAsn(asn) {
  const lineCount = Math.max(1, Number(asn?.lines_count || 1));
  return Array.from({ length: lineCount }).map((_, index) => ({
    line_no: index + 1,
    sku_id: `SKU${String(index + 1).padStart(6, "0")}`,
    expected_qty: 10,
    received_qty: 10,
  }));
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [{ line_no: 1, sku_id: "SKU000001", expected_qty: 1, received_qty: 1 }];
  }

  return lines.map((line, index) => ({
    line_no: index + 1,
    sku_id: line.sku_id || `SKU${String(index + 1).padStart(6, "0")}`,
    expected_qty: Number(line.expected_qty || 0),
    received_qty: Number(line.received_qty || 0),
  }));
}

function createGrn({ tenantId, warehouseId, userId, asnId, supplierId, receivedDate, notes, lines }) {
  let resolvedSupplierId = supplierId;
  let resolvedSupplierName = "";

  if (asnId) {
    const asn = getAsn(tenantId, asnId);
    if (!asn) {
      return { error: "ASN not found" };
    }
    resolvedSupplierId = asn.supplier_id;
    resolvedSupplierName = asn.supplier_name;
    if (!lines || lines.length === 0) {
      lines = defaultLinesFromAsn(asn);
    }
  }

  const supplier = getSupplier(tenantId, resolvedSupplierId);
  if (!supplier) {
    return { error: "Supplier not found" };
  }

  if (!supplier.is_active) {
    return { error: "Supplier is inactive" };
  }

  resolvedSupplierName = supplier.supplier_name;
  const now = new Date().toISOString();
  const grn = {
    grn_id: nextPrefixedId("GRN"),
    asn_id: asnId || null,
    supplier_id: resolvedSupplierId,
    supplier_name: resolvedSupplierName,
    received_date: receivedDate || now.slice(0, 10),
    status: "draft",
    notes: notes || "",
    tenant_id: tenantId,
    warehouse_id: warehouseId || null,
    created_by: userId,
    created_at: now,
    updated_at: now,
    cancellation_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    lines: normalizeLines(lines),
  };

  db.grns.push(grn);
  return { data: clone(grn) };
}

function updateAsn(tenantId, asnId, updater) {
  const idx = db.asns.findIndex((item) => item.tenant_id === tenantId && item.asn_id === asnId);
  if (idx < 0) {
    return null;
  }

  const next = updater({ ...db.asns[idx] });
  if (!next) {
    return null;
  }

  db.asns[idx] = next;
  return clone(next);
}

function updateGrn(tenantId, grnId, updater) {
  const idx = db.grns.findIndex((item) => item.tenant_id === tenantId && item.grn_id === grnId);
  if (idx < 0) {
    return null;
  }

  const next = updater({ ...db.grns[idx] });
  if (!next) {
    return null;
  }

  db.grns[idx] = next;
  return clone(next);
}

function listAssignableOperators(tenantId, warehouseId = null) {
  return clone(
    db.users
      .filter((user) => user.tenant_id === tenantId)
      .filter((user) => user.is_active)
      .filter((user) => user.role_id === "storeoperator")
      .filter((user) => {
        if (!warehouseId) {
          return true;
        }
        return Array.isArray(user.warehouse_ids) && user.warehouse_ids.includes(warehouseId);
      })
      .map((user) => ({
        user_id: user.user_id,
        user_name: user.user_name,
      }))
      .sort((a, b) => a.user_name.localeCompare(b.user_name)),
  );
}

function getUserById(tenantId, userId) {
  return db.users.find((item) => item.tenant_id === tenantId && item.user_id === userId) || null;
}

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function applyPutawaySearch(row, searchValue) {
  if (!searchValue) {
    return true;
  }

  const fields = [
    row.task_id,
    row.grn_id,
    row.sku_id,
    row.source_location,
    row.suggested_bin,
    row.status,
    row.priority,
  ];

  return fields.some((field) => String(field || "").toLowerCase().includes(searchValue));
}

function applyPutawayFilters(row, filters) {
  const statusFilter = normalizeSearchValue(filters?.status);
  const priorityFilter = normalizeSearchValue(filters?.priority);
  const sourceFilter = normalizeSearchValue(filters?.source);
  const suggestedBinFilter = normalizeSearchValue(filters?.suggestedBin);
  const grnFilter = normalizeSearchValue(filters?.grn);
  const skuFilter = normalizeSearchValue(filters?.sku);

  if (statusFilter && normalizeSearchValue(row.status) !== statusFilter) {
    return false;
  }
  if (priorityFilter && normalizeSearchValue(row.priority) !== priorityFilter) {
    return false;
  }
  if (sourceFilter && !normalizeSearchValue(row.source_location).includes(sourceFilter)) {
    return false;
  }
  if (suggestedBinFilter && !normalizeSearchValue(row.suggested_bin).includes(suggestedBinFilter)) {
    return false;
  }
  if (grnFilter && !normalizeSearchValue(row.grn_id).includes(grnFilter)) {
    return false;
  }
  if (skuFilter && !normalizeSearchValue(row.sku_id).includes(skuFilter)) {
    return false;
  }

  return true;
}

function listPutawayTasks({
  tenantId,
  page = 1,
  pageSize = 10,
  search = "",
  filters = {},
  warehouseId = null,
}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const searchValue = normalizeSearchValue(search);

  const scoped = db.putaway_tasks
    .filter((row) => row.tenant_id === tenantId)
    .filter((row) => (warehouseId ? row.warehouse_id === warehouseId : true))
    .filter((row) => applyPutawaySearch(row, searchValue))
    .filter((row) => applyPutawayFilters(row, filters))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const total = scoped.length;
  const offset = (safePage - 1) * safePageSize;
  const paged = scoped.slice(offset, offset + safePageSize);

  return {
    items: clone(paged),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

function getPutawayTask(tenantId, taskId, warehouseId = null) {
  const item = db.putaway_tasks.find((row) => row.tenant_id === tenantId && row.task_id === taskId) || null;
  if (!item) {
    return null;
  }

  if (warehouseId && item.warehouse_id !== warehouseId) {
    return null;
  }

  return clone(item);
}

function updatePutawayTask(tenantId, taskId, updater, warehouseId = null) {
  const idx = db.putaway_tasks.findIndex((row) => row.tenant_id === tenantId && row.task_id === taskId);
  if (idx < 0) {
    return null;
  }

  if (warehouseId && db.putaway_tasks[idx].warehouse_id !== warehouseId) {
    return null;
  }

  const next = updater({ ...db.putaway_tasks[idx] });
  if (!next) {
    return null;
  }

  db.putaway_tasks[idx] = next;
  return clone(next);
}

function createPutawayTaskEvent({
  tenantId,
  taskId,
  eventType,
  eventPayload,
  createdBy,
  createdAt = null,
}) {
  const event = {
    event_id: nextPrefixedId("PUTEVT"),
    tenant_id: tenantId,
    task_id: taskId,
    event_type: eventType,
    event_payload: eventPayload || {},
    created_by: createdBy,
    created_at: createdAt || new Date().toISOString(),
  };
  db.putaway_task_events.push(event);
  return clone(event);
}

function listPutawayTaskEvents(tenantId, taskId, warehouseId = null) {
  const task = getPutawayTask(tenantId, taskId, warehouseId);
  if (!task) {
    return [];
  }

  return clone(
    db.putaway_task_events
      .filter((row) => row.tenant_id === tenantId && row.task_id === taskId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );
}

function assignPutawayTask({
  tenantId,
  taskId,
  assignedToUserId,
  actorUserId,
  warehouseId = null,
}) {
  const assignee = getUserById(tenantId, assignedToUserId);
  if (!assignee || !assignee.is_active) {
    return { error: "Assigned user not found for tenant" };
  }

  if (assignee.role_id !== "storeoperator") {
    return { error: "Assigned user must be a store operator" };
  }

  if (warehouseId && !assignee.warehouse_ids?.includes(warehouseId)) {
    return { error: "Assigned user is not mapped to this warehouse" };
  }

  const now = new Date().toISOString();
  const updated = updatePutawayTask(
    tenantId,
    taskId,
    (current) => ({
      ...current,
      assigned_to_user_id: assignee.user_id,
      assigned_to_user_name: assignee.user_name,
      status: current.status === "pending" ? "in_progress" : current.status,
      started_at: current.started_at || now,
      updated_at: now,
      updated_by: actorUserId,
    }),
    warehouseId,
  );

  if (!updated) {
    return { error: "Task not found" };
  }

  createPutawayTaskEvent({
    tenantId,
    taskId,
    eventType: "assigned",
    eventPayload: {
      assigned_to_user_id: assignee.user_id,
      assigned_to_user_name: assignee.user_name,
    },
    createdBy: actorUserId,
    createdAt: now,
  });

  return { data: updated };
}

function computeSuggestedBinFromSku(skuId) {
  const normalized = String(skuId || "").toUpperCase();
  if (normalized.endsWith("1")) {
    return "A-01-001";
  }
  if (normalized.endsWith("2")) {
    return "B-02-001";
  }
  if (normalized.endsWith("3")) {
    return "Q-01-001";
  }
  if (normalized.endsWith("4")) {
    return "A-01-002";
  }
  return "C-01-001";
}

function recomputePutawaySuggestedBin({
  tenantId,
  taskId,
  actorUserId,
  warehouseId = null,
}) {
  const now = new Date().toISOString();
  const current = getPutawayTask(tenantId, taskId, warehouseId);
  if (!current) {
    return { error: "Task not found" };
  }

  const previousBin = current.suggested_bin;
  const nextBin = computeSuggestedBinFromSku(current.sku_id);

  const updated = updatePutawayTask(
    tenantId,
    taskId,
    (task) => ({
      ...task,
      suggested_bin: nextBin,
      updated_at: now,
      updated_by: actorUserId,
    }),
    warehouseId,
  );

  createPutawayTaskEvent({
    tenantId,
    taskId,
    eventType: "recompute_bin",
    eventPayload: {
      old_suggested_bin: previousBin,
      new_suggested_bin: nextBin,
    },
    createdBy: actorUserId,
    createdAt: now,
  });

  return { data: updated };
}

function markPutawayTaskException({
  tenantId,
  taskId,
  reason,
  actorUserId,
  warehouseId = null,
}) {
  const now = new Date().toISOString();
  const updated = updatePutawayTask(
    tenantId,
    taskId,
    (task) => ({
      ...task,
      status: "exception",
      exception_reason: reason,
      validation_result: "failed",
      updated_at: now,
      updated_by: actorUserId,
    }),
    warehouseId,
  );

  if (!updated) {
    return { error: "Task not found" };
  }

  createPutawayTaskEvent({
    tenantId,
    taskId,
    eventType: "exception",
    eventPayload: {
      reason,
    },
    createdBy: actorUserId,
    createdAt: now,
  });

  return { data: updated };
}

const MOBILE_PICK_STATUSES = new Set(["picking", "picked", "verified", "completed"]);
const PORTAL_PICK_STATUSES = new Set(["packed", "shipped"]);
const SYSTEM_PICK_STATUSES = new Set(["draft", "cancelled"]);
const PICK_LIST_STATUSES = new Set(["draft", "picking", "picked", "verified", "completed", "packed", "shipped", "cancelled"]);
const PACK_ORDER_STATUSES = new Set(["draft", "carton_generated", "packed", "shipped"]);
const PORTAL_PACK_STATUSES = new Set(["carton_generated", "packed"]);

function listPickLists({
  tenantId,
  page = 1,
  pageSize = 10,
  search = "",
  status = "",
  waveId = "",
  assignedUser = "",
  warehouseId = null,
}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const searchValue = normalizeSearchValue(search);
  const statusFilter = normalizeSearchValue(status);
  const waveFilter = normalizeSearchValue(waveId);
  const assignedFilter = normalizeSearchValue(assignedUser);

  const rows = db.pick_lists
    .filter((item) => item.tenant_id === tenantId)
    .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true))
    .filter((item) => {
      if (!statusFilter) {
        return true;
      }

      const normalizedStatus = normalizeSearchValue(item.status);
      if (statusFilter === "open") {
        return !["packed", "shipped", "cancelled"].includes(normalizedStatus);
      }

      return normalizedStatus === statusFilter;
    })
    .filter((item) => !waveFilter || normalizeSearchValue(item.wave_id).includes(waveFilter))
    .filter((item) => {
      if (!assignedFilter) {
        return true;
      }
      return [item.assigned_to_user_id, item.assigned_to_user_name].some((field) =>
        normalizeSearchValue(field).includes(assignedFilter),
      );
    })
    .filter((item) => {
      if (!searchValue) {
        return true;
      }
      return [item.pick_list_id, item.wave_id, item.status, item.assigned_to_user_name].some((field) =>
        normalizeSearchValue(field).includes(searchValue),
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((item) => ({
      ...item,
      lines_count: Array.isArray(item.lines) ? item.lines.length : 0,
    }));

  const total = rows.length;
  const offset = (safePage - 1) * safePageSize;
  const items = rows.slice(offset, offset + safePageSize);

  return {
    items: clone(items),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

function getPickList(tenantId, pickListId, warehouseId = null) {
  const item = db.pick_lists.find((row) => row.tenant_id === tenantId && row.pick_list_id === pickListId) || null;
  if (!item) {
    return null;
  }

  if (warehouseId && item.warehouse_id !== warehouseId) {
    return null;
  }

  return clone(item);
}

function updatePickList(tenantId, pickListId, updater, warehouseId = null) {
  const idx = db.pick_lists.findIndex((row) => row.tenant_id === tenantId && row.pick_list_id === pickListId);
  if (idx < 0) {
    return null;
  }

  if (warehouseId && db.pick_lists[idx].warehouse_id !== warehouseId) {
    return null;
  }

  const next = updater({ ...db.pick_lists[idx] });
  if (!next) {
    return null;
  }

  db.pick_lists[idx] = next;
  return clone(next);
}

function updatePickListStatusBySource({
  tenantId,
  pickListId,
  status,
  source,
  userId,
  warehouseId = null,
}) {
  const normalizedSource = normalizeSearchValue(source);
  if (!["portal", "mobile"].includes(normalizedSource)) {
    return { error: "source must be MOBILE or PORTAL" };
  }

  const normalizedStatus = normalizeSearchValue(status);
  if (!PICK_LIST_STATUSES.has(normalizedStatus)) {
    return { error: "status is invalid" };
  }

  if (normalizedSource === "portal") {
    const canPortalUpdate = PORTAL_PICK_STATUSES.has(normalizedStatus);
    if (!canPortalUpdate) {
      return { error: "Portal cannot update mobile-owned picking statuses" };
    }
  }

  if (normalizedSource === "mobile") {
    const canMobileUpdate = MOBILE_PICK_STATUSES.has(normalizedStatus);
    if (!canMobileUpdate) {
      if (PORTAL_PICK_STATUSES.has(normalizedStatus)) {
        return { error: "Mobile cannot update portal-owned packing/shipping statuses" };
      }
      if (SYSTEM_PICK_STATUSES.has(normalizedStatus)) {
        return { error: "Status is controlled by system workflows" };
      }
      return { error: "Status update is not permitted for MOBILE source" };
    }
  }

  const now = new Date().toISOString();
  const updated = updatePickList(
    tenantId,
    pickListId,
    (current) => ({
      ...current,
      status: normalizedStatus,
      started_at: normalizedStatus === "picking" ? current.started_at || now : current.started_at,
      completed_at: ["picked", "verified", "completed", "packed", "shipped"].includes(normalizedStatus)
        ? current.completed_at || now
        : current.completed_at,
      updated_at: now,
      updated_by: userId,
      last_update_source: normalizedSource.toUpperCase(),
    }),
    warehouseId,
  );

  if (!updated) {
    return { error: "Pick list not found" };
  }

  return { data: updated };
}

function listPackagingTypes(tenantId) {
  return clone(
    db.lov_packaging_types
      .filter((item) => item.tenant_id === tenantId && item.is_active)
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
}

function listPackOrders({
  tenantId,
  page = 1,
  pageSize = 10,
  search = "",
  status = "",
  pickListId = "",
  warehouseId = null,
}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const searchValue = normalizeSearchValue(search);
  const statusFilter = normalizeSearchValue(status);
  const pickListFilter = normalizeSearchValue(pickListId);

  const rows = db.pack_orders
    .filter((item) => item.tenant_id === tenantId)
    .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true))
    .filter((item) => !statusFilter || normalizeSearchValue(item.status) === statusFilter)
    .filter((item) => !pickListFilter || normalizeSearchValue(item.pick_list_id).includes(pickListFilter))
    .filter((item) => {
      if (!searchValue) {
        return true;
      }
      return [item.pack_id, item.pick_list_id, item.carton_id, item.status, item.packaging_type].some((field) =>
        normalizeSearchValue(field).includes(searchValue),
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((item) => ({
      ...item,
      pick_list_status: getPickList(tenantId, item.pick_list_id, warehouseId)?.status || null,
    }));

  const total = rows.length;
  const offset = (safePage - 1) * safePageSize;
  const items = rows.slice(offset, offset + safePageSize);

  return {
    items: clone(items),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

function getPackOrder(tenantId, packId, warehouseId = null) {
  const item = db.pack_orders.find((row) => row.tenant_id === tenantId && row.pack_id === packId) || null;
  if (!item) {
    return null;
  }

  if (warehouseId && item.warehouse_id !== warehouseId) {
    return null;
  }

  return clone(item);
}

function updatePackOrder(tenantId, packId, updater, warehouseId = null) {
  const idx = db.pack_orders.findIndex((row) => row.tenant_id === tenantId && row.pack_id === packId);
  if (idx < 0) {
    return null;
  }

  if (warehouseId && db.pack_orders[idx].warehouse_id !== warehouseId) {
    return null;
  }

  const next = updater({ ...db.pack_orders[idx] });
  if (!next) {
    return null;
  }

  db.pack_orders[idx] = next;
  return clone(next);
}

function assertPackOrderCanStartPacking(tenantId, packOrder, warehouseId = null) {
  const pickList = getPickList(tenantId, packOrder.pick_list_id, warehouseId);
  if (!pickList) {
    return { error: "Linked pick list not found" };
  }

  if (normalizeSearchValue(pickList.status) !== "completed") {
    return { error: "Packing can only start when pick list status is COMPLETED" };
  }

  return { data: pickList };
}

function createPackingCarton({
  tenantId,
  packId,
  packagingType,
  source = "PORTAL",
  userId,
  warehouseId = null,
}) {
  const normalizedSource = normalizeSearchValue(source);
  if (normalizedSource !== "portal") {
    return { error: "Only PORTAL source can create cartons" };
  }

  const packOrder = getPackOrder(tenantId, packId, warehouseId);
  if (!packOrder) {
    return { error: "Pack order not found" };
  }

  const canStart = assertPackOrderCanStartPacking(tenantId, packOrder, warehouseId);
  if (canStart.error) {
    return { error: canStart.error };
  }

  const selectedPackaging = normalizeSearchValue(packagingType);
  if (!selectedPackaging) {
    return { error: "packaging_type is required" };
  }

  const packagingValid = listPackagingTypes(tenantId).some((item) => item.value === selectedPackaging);
  if (!packagingValid) {
    return { error: "packaging_type is invalid" };
  }

  const now = new Date().toISOString();
  const updated = updatePackOrder(
    tenantId,
    packId,
    (current) => ({
      ...current,
      carton_id: current.carton_id || nextPrefixedId("CTN"),
      packaging_type: selectedPackaging,
      updated_at: now,
      updated_by: userId,
      last_update_source: "PORTAL",
    }),
    warehouseId,
  );

  if (!updated) {
    return { error: "Pack order not found" };
  }

  return { data: updated };
}

function generatePackingCartonLabel({
  tenantId,
  packId,
  weightKg = null,
  source = "PORTAL",
  userId,
  warehouseId = null,
}) {
  const normalizedSource = normalizeSearchValue(source);
  if (normalizedSource !== "portal") {
    return { error: "Only PORTAL source can generate carton labels" };
  }

  const packOrder = getPackOrder(tenantId, packId, warehouseId);
  if (!packOrder) {
    return { error: "Pack order not found" };
  }

  const canStart = assertPackOrderCanStartPacking(tenantId, packOrder, warehouseId);
  if (canStart.error) {
    return { error: canStart.error };
  }

  const parsedWeight = weightKg === null || weightKg === undefined || weightKg === ""
    ? packOrder.weight_kg
    : Number(weightKg);
  if (parsedWeight !== null && parsedWeight !== undefined && (!Number.isFinite(parsedWeight) || parsedWeight <= 0)) {
    return { error: "weight_kg must be a positive number" };
  }

  const now = new Date().toISOString();
  const updated = updatePackOrder(
    tenantId,
    packId,
    (current) => ({
      ...current,
      carton_id: current.carton_id || nextPrefixedId("CTN"),
      weight_kg: parsedWeight ?? null,
      status: "carton_generated",
      label_generated_at: now,
      updated_at: now,
      updated_by: userId,
      last_update_source: "PORTAL",
    }),
    warehouseId,
  );

  if (!updated) {
    return { error: "Pack order not found" };
  }

  return { data: updated };
}

function confirmPackingOrder({
  tenantId,
  packId,
  weightKg,
  source = "PORTAL",
  userId,
  warehouseId = null,
}) {
  const normalizedSource = normalizeSearchValue(source);
  if (normalizedSource !== "portal") {
    return { error: "Only PORTAL source can confirm packing" };
  }

  const packOrder = getPackOrder(tenantId, packId, warehouseId);
  if (!packOrder) {
    return { error: "Pack order not found" };
  }

  const canStart = assertPackOrderCanStartPacking(tenantId, packOrder, warehouseId);
  if (canStart.error) {
    return { error: canStart.error };
  }

  const parsedWeight = Number(weightKg);
  if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
    return { error: "weight_kg must be a positive number" };
  }

  const now = new Date().toISOString();
  const updated = updatePackOrder(
    tenantId,
    packId,
    (current) => ({
      ...current,
      carton_id: current.carton_id || nextPrefixedId("CTN"),
      weight_kg: parsedWeight,
      status: "packed",
      packed_at: now,
      updated_at: now,
      updated_by: userId,
      last_update_source: "PORTAL",
    }),
    warehouseId,
  );

  if (!updated) {
    return { error: "Pack order not found" };
  }

  const pickListStatusResult = updatePickListStatusBySource({
    tenantId,
    pickListId: updated.pick_list_id,
    status: "packed",
    source: "PORTAL",
    userId,
    warehouseId,
  });

  if (pickListStatusResult.error) {
    return { error: pickListStatusResult.error };
  }

  return { data: updated };
}

const SHIPMENT_TERMINAL_STATUSES = new Set(["dispatched", "closed", "cancelled"]);
const SHIPMENT_ALLOWED_STATUSES = new Set([
  "pending",
  "ready",
  "packed",
  "carton_generated",
  "dispatched",
  "closed",
  "cancelled",
]);

function isShipmentOverdue(shipment, nowDate = new Date()) {
  const dueAt = shipment.dispatch_due_at || shipment.ship_by;
  if (!dueAt) {
    return false;
  }

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  const status = normalizeSearchValue(shipment.status);
  if (SHIPMENT_TERMINAL_STATUSES.has(status)) {
    return false;
  }

  return nowDate.getTime() > dueDate.getTime();
}

function listShipments({
  tenantId,
  page = 1,
  pageSize = 10,
  search = "",
  status = "",
  carrier = "",
  warehouseId = null,
}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const searchValue = normalizeSearchValue(search);
  const statusFilter = normalizeSearchValue(status);
  const carrierFilter = normalizeSearchValue(carrier);
  const nowDate = new Date();

  const rows = db.shipments
    .filter((item) => item.tenant_id === tenantId)
    .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true))
    .filter((item) => {
      if (!statusFilter) {
        return true;
      }

      if (statusFilter === "overdue") {
        return isShipmentOverdue(item, nowDate);
      }

      if (statusFilter === "open") {
        return !SHIPMENT_TERMINAL_STATUSES.has(normalizeSearchValue(item.status));
      }

      if (!SHIPMENT_ALLOWED_STATUSES.has(statusFilter)) {
        return true;
      }

      return normalizeSearchValue(item.status) === statusFilter;
    })
    .filter((item) => !carrierFilter || normalizeSearchValue(item.carrier).includes(carrierFilter))
    .filter((item) => {
      if (!searchValue) {
        return true;
      }

      return [item.shipment_id, item.customer_name, item.customer_id, item.carrier, item.tracking_no, item.status]
        .some((field) => normalizeSearchValue(field).includes(searchValue));
    })
    .map((item) => ({
      ...item,
      is_overdue: isShipmentOverdue(item, nowDate),
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = rows.length;
  const offset = (safePage - 1) * safePageSize;
  const items = rows.slice(offset, offset + safePageSize);

  return {
    items: clone(items),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

const INVENTORY_REASON_REQUIRED_TYPES = new Set(["ADJUSTMENT", "CYCLE_COUNT", "QUARANTINE_MOVE"]);
const CYCLE_COUNT_CANCELABLE_STATUSES = new Set(["DRAFT", "IN_PROGRESS", "SUBMITTED"]);
const ADJUSTMENT_CANCELABLE_STATUSES = new Set(["DRAFT", "SUBMITTED"]);

function getSku(tenantId, skuId) {
  const sku = db.skus.find((item) => item.sku_id === skuId);
  return sku || null;
}

function getInventoryZone(tenantId, zoneId) {
  return db.inventory_zones.find((zone) => zone.tenant_id === tenantId && zone.zone_id === zoneId) || null;
}

function getInventoryLocation(tenantId, locationId) {
  return db.inventory_locations.find((location) => location.tenant_id === tenantId && location.location_id === locationId) || null;
}

function listInventoryZones(tenantId, warehouseId = null) {
  return clone(
    db.inventory_zones
      .filter((zone) => zone.tenant_id === tenantId)
      .filter((zone) => (warehouseId ? zone.warehouse_id === warehouseId : true))
      .sort((a, b) => a.zone_id.localeCompare(b.zone_id)),
  );
}

function listInventoryLocations(tenantId, warehouseId = null) {
  return clone(
    db.inventory_locations
      .filter((location) => location.tenant_id === tenantId)
      .filter((location) => (warehouseId ? location.warehouse_id === warehouseId : true))
      .sort((a, b) => a.location_id.localeCompare(b.location_id)),
  );
}

function listInventoryReasonCodes(tenantId) {
  return clone(
    db.inventory_reason_codes
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => a.reason_code.localeCompare(b.reason_code)),
  );
}

function getInventoryConfig(tenantId) {
  return (
    db.inventory_configs.find((item) => item.tenant_id === tenantId) || {
      tenant_id: tenantId,
      variance_threshold_mode: "percent",
      variance_threshold_percent: 5,
      variance_threshold_abs: 10,
    }
  );
}

function isValidReasonCode(tenantId, reasonCode) {
  return db.inventory_reason_codes.some(
    (item) => item.tenant_id === tenantId && item.reason_code === String(reasonCode || "").trim().toUpperCase(),
  );
}

function listInventoryTransactions(tenantId, warehouseId = null) {
  return clone(
    db.inventory_transactions
      .filter((item) => item.tenant_id === tenantId)
      .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  );
}

function createInventoryTransaction({
  tenantId,
  warehouseId,
  txnType,
  skuId,
  qty,
  uomId,
  fromLocationId,
  toLocationId,
  referenceType,
  referenceId,
  reasonCode,
  createdBy,
  createdAt = null,
}) {
  const normalizedType = String(txnType || "").trim().toUpperCase();
  const quantity = Number(qty);

  if (!normalizedType) {
    return { error: "txn_type is required" };
  }

  if (!Number.isFinite(quantity) || quantity === 0) {
    return { error: "qty must be a non-zero number" };
  }

  if (!getSku(tenantId, skuId)) {
    return { error: "sku_id is invalid" };
  }

  if (fromLocationId && !getInventoryLocation(tenantId, fromLocationId)) {
    return { error: "from_location_id is invalid" };
  }

  if (toLocationId && !getInventoryLocation(tenantId, toLocationId)) {
    return { error: "to_location_id is invalid" };
  }

  const normalizedReasonCode = reasonCode ? String(reasonCode).trim().toUpperCase() : null;
  if (INVENTORY_REASON_REQUIRED_TYPES.has(normalizedType)) {
    if (!normalizedReasonCode) {
      return { error: `reason_code is required for ${normalizedType}` };
    }
    if (!isValidReasonCode(tenantId, normalizedReasonCode)) {
      return { error: "reason_code is invalid" };
    }
  }

  const transaction = {
    tenant_id: tenantId,
    warehouse_id: warehouseId || null,
    txn_id: nextPrefixedId("ITX"),
    txn_type: normalizedType,
    sku_id: skuId,
    qty: quantity,
    uom_id: uomId || getSku(tenantId, skuId)?.uom_id || "EA",
    from_location_id: fromLocationId || null,
    to_location_id: toLocationId || null,
    reference_type: referenceType || "MANUAL",
    reference_id: referenceId || null,
    reason_code: normalizedReasonCode,
    created_at: createdAt || new Date().toISOString(),
    created_by: createdBy,
  };

  db.inventory_transactions.push(transaction);
  return { data: clone(transaction) };
}

function isQuarantineLocation(tenantId, locationId) {
  const location = getInventoryLocation(tenantId, locationId);
  if (!location) {
    return false;
  }
  const zone = getInventoryZone(tenantId, location.zone_id);
  return zone?.zone_type === "quarantine";
}

function buildInventorySummaryRows(tenantId, warehouseId = null) {
  const transactions = db.inventory_transactions
    .filter((item) => item.tenant_id === tenantId)
    .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true));

  const summaryMap = new Map();

  const ensureRow = (skuId, locationId) => {
    const key = `${skuId}::${locationId}`;
    if (!summaryMap.has(key)) {
      const sku = getSku(tenantId, skuId);
      const location = getInventoryLocation(tenantId, locationId);
      summaryMap.set(key, {
        tenant_id: tenantId,
        warehouse_id: location?.warehouse_id || warehouseId || null,
        sku_id: skuId,
        sku_description: sku?.description || "",
        uom_id: sku?.uom_id || "EA",
        location_id: locationId,
        location_code: location?.location_code || locationId,
        zone_id: location?.zone_id || null,
        on_hand_qty: 0,
        reserved_qty: 0,
        available_qty: 0,
        quarantine_qty: 0,
      });
    }
    return summaryMap.get(key);
  };

  for (const txn of transactions) {
    const quantity = Number(txn.qty || 0);
    if (!Number.isFinite(quantity) || quantity === 0) {
      continue;
    }

    if (["RESERVE", "UNRESERVE"].includes(txn.txn_type)) {
      const locationId = txn.to_location_id || txn.from_location_id;
      if (!locationId) {
        continue;
      }
      const row = ensureRow(txn.sku_id, locationId);
      row.reserved_qty += quantity;
      continue;
    }

    if (txn.from_location_id && txn.to_location_id) {
      const absQty = Math.abs(quantity);
      const fromRow = ensureRow(txn.sku_id, txn.from_location_id);
      const toRow = ensureRow(txn.sku_id, txn.to_location_id);
      fromRow.on_hand_qty -= absQty;
      toRow.on_hand_qty += absQty;
      continue;
    }

    if (txn.to_location_id) {
      const toRow = ensureRow(txn.sku_id, txn.to_location_id);
      toRow.on_hand_qty += quantity;
      continue;
    }

    if (txn.from_location_id) {
      const fromRow = ensureRow(txn.sku_id, txn.from_location_id);
      fromRow.on_hand_qty += quantity;
    }
  }

  const rows = Array.from(summaryMap.values()).map((row) => {
    const reserved = Math.max(row.reserved_qty, 0);
    const quarantine = isQuarantineLocation(tenantId, row.location_id) ? Math.max(row.on_hand_qty, 0) : 0;
    const available = Math.max(row.on_hand_qty - reserved - quarantine, 0);

    return {
      ...row,
      reserved_qty: reserved,
      quarantine_qty: quarantine,
      available_qty: available,
    };
  });

  return rows.sort((a, b) => {
    const skuCompare = a.sku_id.localeCompare(b.sku_id);
    if (skuCompare !== 0) {
      return skuCompare;
    }
    return a.location_id.localeCompare(b.location_id);
  });
}

function listInventorySummary({
  tenantId,
  page = 1,
  pageSize = 10,
  search = "",
  skuId = "",
  locationId = "",
  zoneId = "",
  warehouseId = null,
}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const searchValue = normalizeSearchValue(search);
  const skuFilter = normalizeSearchValue(skuId);
  const locationFilter = normalizeSearchValue(locationId);
  const zoneFilter = normalizeSearchValue(zoneId);

  const filtered = buildInventorySummaryRows(tenantId, warehouseId)
    .filter((row) => !skuFilter || normalizeSearchValue(row.sku_id).includes(skuFilter))
    .filter((row) => !locationFilter || normalizeSearchValue(row.location_id).includes(locationFilter) || normalizeSearchValue(row.location_code).includes(locationFilter))
    .filter((row) => !zoneFilter || normalizeSearchValue(row.zone_id).includes(zoneFilter))
    .filter((row) => {
      if (!searchValue) {
        return true;
      }
      const fields = [
        row.sku_id,
        row.sku_description,
        row.location_id,
        row.location_code,
        row.zone_id,
      ];
      return fields.some((field) => normalizeSearchValue(field).includes(searchValue));
    });

  const total = filtered.length;
  const offset = (safePage - 1) * safePageSize;
  const items = filtered.slice(offset, offset + safePageSize);

  return {
    items: clone(items),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

function listCountPlans({
  tenantId,
  page = 1,
  pageSize = 10,
  search = "",
  status = "",
  zoneId = "",
  warehouseId = null,
}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const searchValue = normalizeSearchValue(search);
  const statusFilter = normalizeSearchValue(status);
  const zoneFilter = normalizeSearchValue(zoneId);

  const rows = db.count_plans
    .filter((plan) => plan.tenant_id === tenantId)
    .filter((plan) => (warehouseId ? plan.warehouse_id === warehouseId : true))
    .filter((plan) => !statusFilter || normalizeSearchValue(plan.status) === statusFilter)
    .filter((plan) => !zoneFilter || normalizeSearchValue(plan.zone_id) === zoneFilter)
    .filter((plan) => {
      if (!searchValue) {
        return true;
      }
      return [plan.count_id, plan.zone_id, plan.status, plan.scope_type].some((field) =>
        normalizeSearchValue(field).includes(searchValue),
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((plan) => {
      const lines = db.count_plan_lines.filter((line) => line.tenant_id === tenantId && line.count_id === plan.count_id);
      const varianceTotal = lines.reduce((sum, line) => sum + Number(line.variance_qty || 0), 0);
      return {
        ...plan,
        lines_count: lines.length,
        variance_total: varianceTotal,
      };
    });

  const total = rows.length;
  const offset = (safePage - 1) * safePageSize;
  const items = rows.slice(offset, offset + safePageSize);

  return {
    items: clone(items),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

function getCountPlan(tenantId, countId, warehouseId = null) {
  const plan = db.count_plans.find((item) => item.tenant_id === tenantId && item.count_id === countId) || null;
  if (!plan) {
    return null;
  }
  if (warehouseId && plan.warehouse_id !== warehouseId) {
    return null;
  }
  return clone(plan);
}

function getCountPlanLines(tenantId, countId) {
  return clone(
    db.count_plan_lines
      .filter((item) => item.tenant_id === tenantId && item.count_id === countId)
      .sort((a, b) => a.line_id.localeCompare(b.line_id)),
  );
}

function getCountEntries(tenantId, countId) {
  return clone(
    db.count_entries
      .filter((item) => item.tenant_id === tenantId && item.count_id === countId)
      .sort((a, b) => a.scanned_at.localeCompare(b.scanned_at)),
  );
}

function listCountPlanLines(tenantId, countId) {
  return getCountPlanLines(tenantId, countId);
}

function listCountEntries(tenantId, countId) {
  return getCountEntries(tenantId, countId);
}

function hydrateCountPlan(tenantId, countId, warehouseId = null) {
  const plan = getCountPlan(tenantId, countId, warehouseId);
  if (!plan) {
    return null;
  }

  return {
    ...plan,
    lines: getCountPlanLines(tenantId, countId),
    entries: getCountEntries(tenantId, countId),
  };
}

function updateCountPlan(tenantId, countId, updater, warehouseId = null) {
  const idx = db.count_plans.findIndex((item) => item.tenant_id === tenantId && item.count_id === countId);
  if (idx < 0) {
    return null;
  }

  if (warehouseId && db.count_plans[idx].warehouse_id !== warehouseId) {
    return null;
  }

  const next = updater({ ...db.count_plans[idx] });
  if (!next) {
    return null;
  }

  db.count_plans[idx] = next;
  return clone(next);
}

function updateCountPlanLine(tenantId, lineId, updater) {
  const idx = db.count_plan_lines.findIndex((item) => item.tenant_id === tenantId && item.line_id === lineId);
  if (idx < 0) {
    return null;
  }

  const next = updater({ ...db.count_plan_lines[idx] });
  if (!next) {
    return null;
  }

  db.count_plan_lines[idx] = next;
  return clone(next);
}

function resolveLineByScan({
  tenantId,
  countId,
  lineId,
  scanMode,
  scannedValue,
}) {
  const lines = db.count_plan_lines.filter((line) => line.tenant_id === tenantId && line.count_id === countId);
  if (lines.length === 0) {
    return { error: "Count plan has no lines" };
  }

  if (lineId) {
    const byLine = lines.find((line) => line.line_id === lineId);
    if (!byLine) {
      return { error: "line_id not found in count plan" };
    }
    return { data: byLine };
  }

  const value = String(scannedValue || "").trim().toUpperCase();
  if (!value) {
    return { error: "scanned_value is required when line_id is not provided" };
  }

  const skuMatch = /SKU\d{6}/.exec(value)?.[0] || null;
  const locationIdMatch = /LOC\d{6}/.exec(value)?.[0] || null;
  const locationCode = db.inventory_locations.find(
    (location) =>
      location.tenant_id === tenantId &&
      (normalizeSearchValue(location.location_code) === normalizeSearchValue(value) || location.location_id === value),
  );

  if (scanMode === "RFID") {
    const skuFromEpc = db.skus.find((sku) => sku.epc_value?.toUpperCase() === value);
    if (skuFromEpc) {
      const bySku = lines.filter((line) => line.sku_id === skuFromEpc.sku_id);
      if (bySku.length === 1) {
        return { data: bySku[0] };
      }
    }
  }

  if (skuMatch) {
    const bySku = lines.filter((line) => line.sku_id === skuMatch);
    if (bySku.length === 1) {
      return { data: bySku[0] };
    }
  }

  if (locationIdMatch) {
    const byLocation = lines.filter((line) => line.location_id === locationIdMatch);
    if (byLocation.length === 1) {
      return { data: byLocation[0] };
    }
  }

  if (locationCode) {
    const byLocation = lines.filter((line) => line.location_id === locationCode.location_id);
    if (byLocation.length === 1) {
      return { data: byLocation[0] };
    }
  }

  if (scanMode === "MANUAL") {
    const byExactSku = lines.filter((line) => normalizeSearchValue(line.sku_id) === normalizeSearchValue(value));
    if (byExactSku.length === 1) {
      return { data: byExactSku[0] };
    }
  }

  return { error: "Unable to resolve scanned value to a single count line" };
}

function createCountPlan({
  tenantId,
  warehouseId,
  userId,
  zoneId,
  plannedDate,
  scopeType = "FULL_ZONE",
  scopeLocationId = null,
  scopeSkuIds = [],
}) {
  const zone = getInventoryZone(tenantId, zoneId);
  if (!zone) {
    return { error: "zone_id is invalid" };
  }

  if (warehouseId && zone.warehouse_id !== warehouseId) {
    return { error: "zone is outside warehouse scope" };
  }

  const normalizedScope = String(scopeType || "FULL_ZONE").toUpperCase();
  if (!["FULL_ZONE", "BY_LOCATION", "BY_SKU"].includes(normalizedScope)) {
    return { error: "scope_type is invalid" };
  }

  const sourceRows = buildInventorySummaryRows(tenantId, warehouseId)
    .filter((row) => row.zone_id === zoneId)
    .filter((row) => (normalizedScope === "BY_LOCATION" && scopeLocationId ? row.location_id === scopeLocationId : true))
    .filter((row) =>
      normalizedScope === "BY_SKU" && Array.isArray(scopeSkuIds) && scopeSkuIds.length > 0
        ? scopeSkuIds.includes(row.sku_id)
        : true,
    );

  if (sourceRows.length === 0) {
    return { error: "No inventory found for selected scope" };
  }

  const now = new Date().toISOString();
  const countId = nextPrefixedId("CC");
  const header = {
    count_id: countId,
    tenant_id: tenantId,
    warehouse_id: warehouseId || zone.warehouse_id || null,
    zone_id: zoneId,
    planned_date: plannedDate || now.slice(0, 10),
    status: "DRAFT",
    scope_type: normalizedScope,
    created_at: now,
    created_by: userId,
    submitted_at: null,
    submitted_by: null,
    approved_at: null,
    approved_by: null,
    approval_note: null,
    cancellation_reason: null,
    requires_approval: false,
  };

  const lines = sourceRows.map((row) => ({
    line_id: nextPrefixedId("CCL"),
    count_id: countId,
    tenant_id: tenantId,
    sku_id: row.sku_id,
    location_id: row.location_id,
    system_qty: Number(row.on_hand_qty || 0),
    counted_qty: null,
    variance_qty: null,
    status: "PENDING",
  }));

  db.count_plans.push(header);
  db.count_plan_lines.push(...lines);

  return { data: hydrateCountPlan(tenantId, countId, warehouseId) };
}

function addCountEntry({
  tenantId,
  warehouseId,
  countId,
  lineId,
  scanMode,
  scannedValue,
  qtyCounted,
  scannedBy,
}) {
  const plan = getCountPlan(tenantId, countId, warehouseId);
  if (!plan) {
    return { error: "Count plan not found" };
  }

  if (["APPROVED", "REJECTED", "CANCELLED"].includes(plan.status)) {
    return { error: `Cannot execute entries when count plan is ${plan.status}` };
  }

  const resolvedLine = resolveLineByScan({
    tenantId,
    countId,
    lineId,
    scanMode: String(scanMode || "").toUpperCase(),
    scannedValue,
  });
  if (resolvedLine.error) {
    return { error: resolvedLine.error };
  }

  const quantity = Number(qtyCounted);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "qty_counted must be greater than or equal to 0" };
  }

  const now = new Date().toISOString();
  const line = resolvedLine.data;
  const variance = quantity - Number(line.system_qty || 0);

  const entry = {
    entry_id: nextPrefixedId("CCE"),
    tenant_id: tenantId,
    count_id: countId,
    line_id: line.line_id,
    scan_mode: String(scanMode || "MANUAL").toUpperCase(),
    scanned_value: String(scannedValue || "").trim(),
    qty_counted: quantity,
    qty_delta: variance,
    scanned_at: now,
    scanned_by: scannedBy,
  };
  db.count_entries.push(entry);

  updateCountPlanLine(tenantId, line.line_id, (current) => ({
    ...current,
    counted_qty: quantity,
    variance_qty: variance,
    status: "COUNTED",
  }));

  updateCountPlan(tenantId, countId, (current) => ({
    ...current,
    status: current.status === "DRAFT" ? "IN_PROGRESS" : current.status,
  }), warehouseId);

  return {
    data: {
      entry: clone(entry),
      plan: hydrateCountPlan(tenantId, countId, warehouseId),
    },
  };
}

function varianceRequiresApproval(line, config) {
  const variance = Math.abs(Number(line.variance_qty || 0));
  if (variance === 0) {
    return false;
  }

  if (config.variance_threshold_mode === "absolute") {
    return variance > Number(config.variance_threshold_abs || 0);
  }

  const systemQty = Math.abs(Number(line.system_qty || 0));
  if (systemQty === 0) {
    return variance > 0;
  }
  const variancePercent = (variance / systemQty) * 100;
  return variancePercent > Number(config.variance_threshold_percent || 0);
}

function submitCountPlan({
  tenantId,
  warehouseId,
  countId,
  submittedBy,
}) {
  const plan = getCountPlan(tenantId, countId, warehouseId);
  if (!plan) {
    return { error: "Count plan not found" };
  }

  if (!["DRAFT", "IN_PROGRESS"].includes(plan.status)) {
    return { error: `Cannot submit count plan from ${plan.status}` };
  }

  const lines = getCountPlanLines(tenantId, countId);
  if (lines.length === 0) {
    return { error: "Count plan has no lines" };
  }

  if (lines.some((line) => line.counted_qty === null || line.variance_qty === null)) {
    return { error: "All lines must be counted before submission" };
  }

  const config = getInventoryConfig(tenantId);
  const requiresApproval = lines.some((line) => varianceRequiresApproval(line, config));
  const now = new Date().toISOString();

  updateCountPlan(
    tenantId,
    countId,
    (current) => ({
      ...current,
      status: "SUBMITTED",
      submitted_at: now,
      submitted_by: submittedBy,
      requires_approval: requiresApproval,
    }),
    warehouseId,
  );

  return { data: hydrateCountPlan(tenantId, countId, warehouseId) };
}

function approveCountPlan({
  tenantId,
  warehouseId,
  countId,
  approvedBy,
  reasonCode,
  approvalNote = "",
}) {
  const plan = getCountPlan(tenantId, countId, warehouseId);
  if (!plan) {
    return { error: "Count plan not found" };
  }

  if (plan.status !== "SUBMITTED") {
    return { error: `Cannot approve count plan from ${plan.status}` };
  }

  const normalizedReasonCode = String(reasonCode || "").trim().toUpperCase();
  if (!normalizedReasonCode) {
    return { error: "reason_code is required for cycle count approval" };
  }

  if (!isValidReasonCode(tenantId, normalizedReasonCode)) {
    return { error: "reason_code is invalid" };
  }

  const lines = getCountPlanLines(tenantId, countId);
  const now = new Date().toISOString();

  for (const line of lines) {
    const variance = Number(line.variance_qty || 0);
    if (variance === 0) {
      updateCountPlanLine(tenantId, line.line_id, (current) => ({ ...current, status: "APPROVED" }));
      continue;
    }

    const txnResult = createInventoryTransaction({
      tenantId,
      warehouseId: plan.warehouse_id || warehouseId || null,
      txnType: "CYCLE_COUNT",
      skuId: line.sku_id,
      qty: variance,
      uomId: getSku(tenantId, line.sku_id)?.uom_id || "EA",
      fromLocationId: variance < 0 ? line.location_id : null,
      toLocationId: variance > 0 ? line.location_id : null,
      referenceType: "COUNT_PLAN",
      referenceId: countId,
      reasonCode: normalizedReasonCode,
      createdBy: approvedBy,
      createdAt: now,
    });

    if (txnResult.error) {
      return { error: txnResult.error };
    }

    updateCountPlanLine(tenantId, line.line_id, (current) => ({ ...current, status: "APPROVED" }));
  }

  updateCountPlan(
    tenantId,
    countId,
    (current) => ({
      ...current,
      status: "APPROVED",
      approved_at: now,
      approved_by: approvedBy,
      approval_note: approvalNote || null,
    }),
    warehouseId,
  );

  return { data: hydrateCountPlan(tenantId, countId, warehouseId) };
}

function rejectCountPlan({
  tenantId,
  warehouseId,
  countId,
  approvedBy,
  reason,
}) {
  const plan = getCountPlan(tenantId, countId, warehouseId);
  if (!plan) {
    return { error: "Count plan not found" };
  }

  if (plan.status !== "SUBMITTED") {
    return { error: `Cannot reject count plan from ${plan.status}` };
  }

  const now = new Date().toISOString();
  updateCountPlan(
    tenantId,
    countId,
    (current) => ({
      ...current,
      status: "REJECTED",
      approved_at: now,
      approved_by: approvedBy,
      approval_note: reason,
    }),
    warehouseId,
  );

  return { data: hydrateCountPlan(tenantId, countId, warehouseId) };
}

function cancelCountPlan({
  tenantId,
  warehouseId,
  countId,
  cancelledBy,
  reason,
}) {
  const plan = getCountPlan(tenantId, countId, warehouseId);
  if (!plan) {
    return { error: "Count plan not found" };
  }

  if (!CYCLE_COUNT_CANCELABLE_STATUSES.has(plan.status)) {
    return { error: `Cannot cancel count plan from ${plan.status}` };
  }

  updateCountPlan(
    tenantId,
    countId,
    (current) => ({
      ...current,
      status: "CANCELLED",
      cancellation_reason: reason,
      approved_by: cancelledBy,
      approved_at: new Date().toISOString(),
    }),
    warehouseId,
  );

  return { data: hydrateCountPlan(tenantId, countId, warehouseId) };
}

function listAdjustmentRequests({
  tenantId,
  page = 1,
  pageSize = 10,
  search = "",
  status = "",
  skuId = "",
  locationId = "",
  warehouseId = null,
}) {
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safePageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 10;
  const searchValue = normalizeSearchValue(search);
  const statusFilter = normalizeSearchValue(status);
  const skuFilter = normalizeSearchValue(skuId);
  const locationFilter = normalizeSearchValue(locationId);
  const openStatuses = new Set(["draft", "submitted"]);

  const rows = db.adjustment_requests
    .filter((item) => item.tenant_id === tenantId)
    .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true))
    .filter((item) => {
      if (!statusFilter) {
        return true;
      }

      const normalizedStatus = normalizeSearchValue(item.status);
      if (statusFilter === "open") {
        return openStatuses.has(normalizedStatus);
      }

      return normalizedStatus === statusFilter;
    })
    .filter((item) => !skuFilter || normalizeSearchValue(item.sku_id).includes(skuFilter))
    .filter((item) => !locationFilter || normalizeSearchValue(item.location_id).includes(locationFilter))
    .filter((item) => {
      if (!searchValue) {
        return true;
      }
      return [item.adj_id, item.sku_id, item.location_id, item.reason_code, item.status].some((field) =>
        normalizeSearchValue(field).includes(searchValue),
      );
    })
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at));

  const total = rows.length;
  const offset = (safePage - 1) * safePageSize;
  const items = rows.slice(offset, offset + safePageSize);

  return {
    items: clone(items),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

function getAdjustmentRequest(tenantId, adjId, warehouseId = null) {
  const item = db.adjustment_requests.find((row) => row.tenant_id === tenantId && row.adj_id === adjId) || null;
  if (!item) {
    return null;
  }

  if (warehouseId && item.warehouse_id !== warehouseId) {
    return null;
  }

  return clone(item);
}

function updateAdjustmentRequest(tenantId, adjId, updater, warehouseId = null) {
  const idx = db.adjustment_requests.findIndex((row) => row.tenant_id === tenantId && row.adj_id === adjId);
  if (idx < 0) {
    return null;
  }

  if (warehouseId && db.adjustment_requests[idx].warehouse_id !== warehouseId) {
    return null;
  }

  const next = updater({ ...db.adjustment_requests[idx] });
  if (!next) {
    return null;
  }

  db.adjustment_requests[idx] = next;
  return clone(next);
}

function createAdjustmentRequest({
  tenantId,
  warehouseId,
  requestedBy,
  skuId,
  locationId,
  qtyDelta,
  reasonCode,
}) {
  if (!getSku(tenantId, skuId)) {
    return { error: "sku_id is invalid" };
  }

  if (!getInventoryLocation(tenantId, locationId)) {
    return { error: "location_id is invalid" };
  }

  const quantity = Number(qtyDelta);
  if (!Number.isFinite(quantity) || quantity === 0) {
    return { error: "qty_delta must be a non-zero number" };
  }

  const normalizedReasonCode = String(reasonCode || "").trim().toUpperCase();
  if (!normalizedReasonCode) {
    return { error: "reason_code is required" };
  }
  if (!isValidReasonCode(tenantId, normalizedReasonCode)) {
    return { error: "reason_code is invalid" };
  }

  const now = new Date().toISOString();
  const request = {
    adj_id: nextPrefixedId("ADJ"),
    tenant_id: tenantId,
    warehouse_id: warehouseId || null,
    status: "DRAFT",
    sku_id: skuId,
    location_id: locationId,
    qty_delta: quantity,
    reason_code: normalizedReasonCode,
    requested_by: requestedBy,
    requested_at: now,
    approved_by: null,
    approved_at: null,
    approval_note: null,
    cancellation_reason: null,
  };

  db.adjustment_requests.push(request);
  return { data: clone(request) };
}

function submitAdjustmentRequest({
  tenantId,
  warehouseId,
  adjId,
}) {
  const current = getAdjustmentRequest(tenantId, adjId, warehouseId);
  if (!current) {
    return { error: "Adjustment request not found" };
  }

  if (current.status !== "DRAFT") {
    return { error: `Cannot submit adjustment from ${current.status}` };
  }

  const updated = updateAdjustmentRequest(
    tenantId,
    adjId,
    (row) => ({
      ...row,
      status: "SUBMITTED",
    }),
    warehouseId,
  );

  return { data: updated };
}

function approveAdjustmentRequest({
  tenantId,
  warehouseId,
  adjId,
  approvedBy,
  approvalNote = "",
}) {
  const current = getAdjustmentRequest(tenantId, adjId, warehouseId);
  if (!current) {
    return { error: "Adjustment request not found" };
  }

  if (current.status !== "SUBMITTED") {
    return { error: `Cannot approve adjustment from ${current.status}` };
  }

  const now = new Date().toISOString();
  const txnResult = createInventoryTransaction({
    tenantId,
    warehouseId: current.warehouse_id || warehouseId || null,
    txnType: "ADJUSTMENT",
    skuId: current.sku_id,
    qty: current.qty_delta,
    uomId: getSku(tenantId, current.sku_id)?.uom_id || "EA",
    fromLocationId: current.qty_delta < 0 ? current.location_id : null,
    toLocationId: current.qty_delta > 0 ? current.location_id : null,
    referenceType: "MANUAL",
    referenceId: current.adj_id,
    reasonCode: current.reason_code,
    createdBy: approvedBy,
    createdAt: now,
  });
  if (txnResult.error) {
    return { error: txnResult.error };
  }

  const updated = updateAdjustmentRequest(
    tenantId,
    adjId,
    (row) => ({
      ...row,
      status: "APPROVED",
      approved_by: approvedBy,
      approved_at: now,
      approval_note: approvalNote || null,
    }),
    warehouseId,
  );

  return { data: updated };
}

function rejectAdjustmentRequest({
  tenantId,
  warehouseId,
  adjId,
  approvedBy,
  reason,
}) {
  const current = getAdjustmentRequest(tenantId, adjId, warehouseId);
  if (!current) {
    return { error: "Adjustment request not found" };
  }

  if (current.status !== "SUBMITTED") {
    return { error: `Cannot reject adjustment from ${current.status}` };
  }

  const updated = updateAdjustmentRequest(
    tenantId,
    adjId,
    (row) => ({
      ...row,
      status: "REJECTED",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      approval_note: reason,
    }),
    warehouseId,
  );

  return { data: updated };
}

function cancelAdjustmentRequest({
  tenantId,
  warehouseId,
  adjId,
  cancelledBy,
  reason,
}) {
  const current = getAdjustmentRequest(tenantId, adjId, warehouseId);
  if (!current) {
    return { error: "Adjustment request not found" };
  }

  if (!ADJUSTMENT_CANCELABLE_STATUSES.has(current.status)) {
    return { error: `Cannot cancel adjustment from ${current.status}` };
  }

  const updated = updateAdjustmentRequest(
    tenantId,
    adjId,
    (row) => ({
      ...row,
      status: "CANCELLED",
      approved_by: cancelledBy,
      approved_at: new Date().toISOString(),
      cancellation_reason: reason,
    }),
    warehouseId,
  );

  return { data: updated };
}

function listReturns(tenantId) {
  return clone(
    db.returns
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => b.return_id.localeCompare(a.return_id)),
  );
}

function getReturn(tenantId, returnId) {
  return db.returns.find((item) => item.tenant_id === tenantId && item.return_id === returnId) || null;
}

function createReturn({
  tenantId,
  warehouseId,
  userId,
  shipmentId,
  customerId,
  customerName,
  skuId,
  qty,
  reasonCode,
  reasonDescription,
  notes,
}) {
  const now = new Date().toISOString();
  const record = {
    return_id: nextPrefixedId("RTN"),
    tenant_id: tenantId,
    warehouse_id: warehouseId || null,
    shipment_id: shipmentId || null,
    customer_id: customerId || null,
    customer_name: customerName || "",
    sku_id: skuId || "",
    qty: Number(qty || 0),
    reason_code: reasonCode || "",
    reason_description: reasonDescription || "",
    notes: notes || "",
    status: "new",
    created_at: now,
    created_by: userId,
    updated_at: now,
    cancellation_reason_code: null,
    cancellation_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    received_at: null,
    closed_at: null,
  };

  db.returns.push(record);
  return clone(record);
}

function updateReturn(tenantId, returnId, updater) {
  const idx = db.returns.findIndex((item) => item.tenant_id === tenantId && item.return_id === returnId);
  if (idx < 0) {
    return null;
  }

  const next = updater({ ...db.returns[idx] });
  if (!next) {
    return null;
  }

  db.returns[idx] = next;
  return clone(next);
}

function listRmas(tenantId) {
  return clone(
    db.rmas
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => b.rma_id.localeCompare(a.rma_id)),
  );
}

function getRma(tenantId, rmaId) {
  return db.rmas.find((item) => item.tenant_id === tenantId && item.rma_id === rmaId) || null;
}

function listRmaItems(tenantId, rmaId) {
  return clone(
    db.rma_items
      .filter((item) => item.tenant_id === tenantId && item.rma_id === rmaId)
      .sort((a, b) => a.rma_item_id.localeCompare(b.rma_item_id)),
  );
}

function normalizeRmaItems(tenantId, rmaId, sourceItems, fallbackReturn) {
  if (Array.isArray(sourceItems) && sourceItems.length > 0) {
    return sourceItems.map((item) => ({
      rma_item_id: nextPrefixedId("RMI"),
      tenant_id: tenantId,
      rma_id: rmaId,
      sku_id: item.sku_id || fallbackReturn?.sku_id || "",
      qty: Number(item.qty || 0),
      reason_code: item.reason_code || fallbackReturn?.reason_code || "",
    }));
  }

  return [
    {
      rma_item_id: nextPrefixedId("RMI"),
      tenant_id: tenantId,
      rma_id: rmaId,
      sku_id: fallbackReturn?.sku_id || "",
      qty: Number(fallbackReturn?.qty || 0),
      reason_code: fallbackReturn?.reason_code || "",
    },
  ];
}

function createRma({
  tenantId,
  userId,
  returnRecord,
  notes,
  items,
}) {
  const now = new Date().toISOString();
  const rmaId = nextPrefixedId("RMA");
  const rma = {
    rma_id: rmaId,
    tenant_id: tenantId,
    return_id: returnRecord.return_id,
    status: "created",
    notes: notes || "",
    created_at: now,
    created_by: userId,
    updated_at: now,
    cancellation_reason_code: null,
    cancellation_reason: null,
    cancelled_by: null,
    cancelled_at: null,
    closed_at: null,
  };

  const normalizedItems = normalizeRmaItems(tenantId, rmaId, items, returnRecord).map((item) => ({
    ...item,
    qty: Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 1,
  }));

  db.rmas.push(rma);
  db.rma_items.push(...normalizedItems);

  return {
    rma: clone(rma),
    items: clone(normalizedItems),
  };
}

function updateRma(tenantId, rmaId, updater) {
  const idx = db.rmas.findIndex((item) => item.tenant_id === tenantId && item.rma_id === rmaId);
  if (idx < 0) {
    return null;
  }

  const next = updater({ ...db.rmas[idx] });
  if (!next) {
    return null;
  }

  db.rmas[idx] = next;
  return clone(next);
}

function listAuditLogs(tenantId) {
  return clone(
    db.audit_logs
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  );
}

const TRACE_PAGE_SIZES = new Set([10, 20, 50]);
const TRACE_FILTER_TYPES = new Set(["sku", "epc", "grn", "do", "rma", "put", "asn", "adj", "location", "reference"]);

const traceProcessLabels = {
  received: "Receiving",
  putaway: "Putaway",
  picked: "Picking",
  shipped: "Shipping",
  returned: "Returns",
  status_change: "Status Transition",
  audit_event: "Audit",
};

function normalizeTraceEventId(value) {
  const match = /^TRC(\d+)$/i.exec(String(value || "").trim());
  if (!match) {
    return String(value || "");
  }
  return `TRC${String(match[1]).padStart(9, "0")}`;
}

function toTraceLocationPath(row) {
  if (row.location_path) {
    return row.location_path;
  }

  const warehouse = row.warehouse_name || row.warehouse_id || "-";
  const zone = row.zone_code || "-";
  const bin = row.bin_code || "-";
  return `${warehouse} / ${zone} / ${bin}`;
}

function toTraceActorModel(tenantId, row) {
  const actorType = String(row.performed_by_type || "system").toLowerCase();
  const actorId = row.performed_by || row.user_id || null;
  const actorUser = actorType === "user" && actorId ? getUserById(tenantId, actorId) : null;

  return {
    actorType,
    actorId,
    actorName: actorUser?.user_name || (actorType === "user" ? actorId : null),
    deviceCode: actorType === "device" ? actorId : null,
    systemCode: actorType === "system" ? actorId : null,
  };
}

function toTraceTimelineEvent(tenantId, row) {
  const actor = toTraceActorModel(tenantId, row);
  const refType = String(row.reference_type || row.ref_type || "").trim().toUpperCase() || null;
  const refNo = row.reference_id || row.ref_no || row.entity_id || null;
  const status = String(row.status || row.event_type || "unknown").trim().toLowerCase();

  return {
    id: normalizeTraceEventId(row.event_id || row.trace_event_id),
    eventType: String(row.event_type || "").trim().toLowerCase() || "unknown",
    status,
    eventAt: row.event_at || row.timestamp || null,
    warehouseId: row.warehouse_id || null,
    warehouseName: row.warehouse_name || null,
    process: row.process || traceProcessLabels[status] || "Trace",
    locationCode: row.location_code || row.bin_code || null,
    locationPath: toTraceLocationPath(row),
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorName: actor.actorName,
    deviceCode: actor.deviceCode,
    systemCode: actor.systemCode,
    sku: row.sku_code || row.sku_id || null,
    epc: row.epc || null,
    qrPayload: row.qr_payload || null,
    refType,
    refNo,
  };
}

function traceEventMatchesFilter(row, filterType, filterValue) {
  const normalizedType = String(filterType || "").trim().toLowerCase();
  const normalizedValue = normalizeSearchValue(filterValue);
  if (!TRACE_FILTER_TYPES.has(normalizedType)) {
    return false;
  }

  if (!normalizedValue) {
    return true;
  }

  if (normalizedType === "sku") {
    return normalizeSearchValue(row.sku_id || row.sku_code).includes(normalizedValue);
  }

  if (normalizedType === "epc") {
    return normalizeSearchValue(row.epc).includes(normalizedValue);
  }

  if (normalizedType === "location") {
    const locationPath = toTraceLocationPath(row);
    return [row.location_code, row.bin_code, row.zone_code, locationPath].some((field) =>
      normalizeSearchValue(field).includes(normalizedValue),
    );
  }

  if (normalizedType === "reference") {
    const fields = [row.reference_type, row.reference_id, row.entity_id, row.qr_payload];
    return fields.some((field) => normalizeSearchValue(field).includes(normalizedValue));
  }

  const expectedRefType = normalizedType.toUpperCase();
  if (String(row.reference_type || "").trim().toUpperCase() !== expectedRefType) {
    return false;
  }

  return normalizeSearchValue(row.reference_id).includes(normalizedValue);
}

function createTraceContext(filteredRows, filterType, filterValue) {
  if (!Array.isArray(filteredRows) || filteredRows.length === 0) {
    return null;
  }

  const latest = filteredRows[0];
  return {
    lastStatus: latest.status,
    lastLocation: latest.locationPath || latest.locationCode || null,
    lastEventAt: latest.eventAt || null,
    warehouseName: latest.warehouseName || null,
    sku: latest.sku || null,
    epc: latest.epc || null,
    filterType: String(filterType || "").toLowerCase(),
    filterValue: filterValue || "",
  };
}

function listTraceEvents(tenantId, warehouseId = null) {
  return clone(
    db.trace_events
      .filter((item) => item.tenant_id === tenantId)
      .filter((item) => (warehouseId ? item.warehouse_id === warehouseId : true))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  );
}

function listTraceTimeline({
  tenantId,
  mode = "global",
  filterType = "",
  filterValue = "",
  warehouseId = null,
  page = 1,
  pageSize = 20,
}) {
  const safeMode = String(mode || "global").toLowerCase() === "filtered" ? "filtered" : "global";
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const requestedPageSize = Number(pageSize);
  const safePageSize = TRACE_PAGE_SIZES.has(requestedPageSize) ? requestedPageSize : 20;

  const allRows = listTraceEvents(tenantId, warehouseId).map((row) => toTraceTimelineEvent(tenantId, row));

  const filteredRows = safeMode === "filtered"
    ? allRows.filter((row) => traceEventMatchesFilter(
      {
        sku_id: row.sku,
        sku_code: row.sku,
        epc: row.epc,
        location_code: row.locationCode,
        bin_code: row.locationCode,
        zone_code: row.process,
        location_path: row.locationPath,
        reference_type: row.refType,
        reference_id: row.refNo,
        qr_payload: row.qrPayload,
      },
      filterType,
      filterValue,
    ))
    : allRows;

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 1) / safePageSize));
  const boundedPage = Math.min(safePage, totalPages);
  const offset = (boundedPage - 1) * safePageSize;

  return {
    mode: safeMode,
    filter: safeMode === "filtered"
      ? { type: String(filterType || "").toLowerCase(), value: String(filterValue || "") }
      : null,
    context: safeMode === "filtered" ? createTraceContext(filteredRows, filterType, filterValue) : null,
    data: clone(filteredRows.slice(offset, offset + safePageSize)),
    pagination: {
      page: boundedPage,
      pageSize: safePageSize,
      total,
      totalPages,
    },
  };
}

function searchTraceEvents({
  tenantId,
  warehouseId = null,
  page = 1,
  pageSize = 10,
  sku = "",
  epc = "",
  qrPayload = "",
  reference = "",
}) {
  const filterCandidates = [
    { type: "sku", value: sku },
    { type: "epc", value: epc },
    { type: "reference", value: reference },
    { type: "reference", value: qrPayload },
  ];
  const activeFilter = filterCandidates.find((item) => String(item.value || "").trim());

  if (!activeFilter) {
    const result = listTraceTimeline({
      tenantId,
      mode: "global",
      warehouseId,
      page,
      pageSize,
    });

    return {
      items: result.data,
      total: result.pagination.total,
      page: result.pagination.page,
      pageSize: result.pagination.pageSize,
    };
  }

  const result = listTraceTimeline({
    tenantId,
    mode: "filtered",
    filterType: activeFilter.type,
    filterValue: activeFilter.value,
    warehouseId,
    page,
    pageSize,
  });

  return {
    items: result.data,
    total: result.pagination.total,
    page: result.pagination.page,
    pageSize: result.pagination.pageSize,
  };
}

function addAuditLog(entry) {
  const log = {
    audit_id: nextPrefixedId("AUD"),
    ...entry,
  };
  db.audit_logs.push(log);
  return clone(log);
}

function addTraceEvent(entry) {
  const traceEvent = {
    event_id: nextPrefixedId("TRC"),
    ...entry,
  };
  db.trace_events.push(traceEvent);
  return clone(traceEvent);
}

export {
  addAuditLog,
  addCountEntry,
  addTraceEvent,
  approveAdjustmentRequest,
  approveCountPlan,
  assignPutawayTask,
  cancelAdjustmentRequest,
  cancelCountPlan,
  createAsn,
  createAdjustmentRequest,
  createCountPlan,
  createGrn,
  createInventoryTransaction,
  createPutawayTaskEvent,
  createSupplier,
  createReturn,
  createRma,
  deleteSupplier,
  getAdjustmentRequest,
  getAsn,
  getCountPlan,
  getGrn,
  getInventoryConfig,
  getInventoryLocation,
  getInventoryZone,
  getPackOrder,
  getPickList,
  getPutawayTask,
  getReturn,
  getRma,
  getSupplier,
  getUserById,
  isKnownTenant,
  listAdjustmentRequests,
  listAsns,
  listAuditLogs,
  listCountPlans,
  listCountEntries,
  listCountPlanLines,
  listGrns,
  listPackOrders,
  listPackagingTypes,
  listPickLists,
  listAssignableOperators,
  listInventoryLocations,
  listInventoryReasonCodes,
  listInventorySummary,
  listInventoryTransactions,
  listInventoryZones,
  listPutawayTaskEvents,
  listPutawayTasks,
  listReturns,
  listRmaItems,
  listRmas,
  listShipments,
  listSuppliers,
  listTraceEvents,
  listTraceTimeline,
  searchTraceEvents,
  rejectAdjustmentRequest,
  rejectCountPlan,
  markPutawayTaskException,
  submitAdjustmentRequest,
  submitCountPlan,
  hydrateCountPlan,
  createPackingCarton,
  confirmPackingOrder,
  generatePackingCartonLabel,
  recomputePutawaySuggestedBin,
  updateAsn,
  updateAdjustmentRequest,
  updateCountPlan,
  updateCountPlanLine,
  updateGrn,
  updatePutawayTask,
  updatePickListStatusBySource,
  updateReturn,
  updateRma,
  updateSupplier,
};
export { db };