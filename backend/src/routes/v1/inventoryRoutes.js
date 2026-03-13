import express from "express";
import { requireRole } from "../../middlewares/auth.js";

const router = express.Router();

const allowedRoles = [
  "superadmin",
  "hqadmin",
  "storemanager",
  "warehousemanager",
  "storeoperator"
];

/* ==============================
   INVENTORY OPTIONS
============================== */
router.get("/options", requireRole(allowedRoles), (req, res) => {

  res.json({
    zones: [
      { zone_id: "PICK", zone_name: "Picking Zone" },
      { zone_id: "STORAGE", zone_name: "Storage Zone" }
    ],

    locations: [
      { location_id: "LOC001", location_code: "A01-01" },
      { location_id: "LOC002", location_code: "B01-01" }
    ],

    reason_codes: [
      { reason_code: "DMG", reason_name: "Damaged" },
      { reason_code: "MISS", reason_name: "Missing" }
    ],

    count_config: {
      variance_threshold_mode: "absolute",
      variance_threshold_abs: 5
    }

  });

});

/* ==============================
   STOCK SUMMARY
============================== */
router.get("/summary", requireRole(allowedRoles), (req, res) => {

  res.json({
    items: [
      {
        sku_id: "SKU000001",
        sku_description: "Product A",
        location_id: "LOC001",
        location_code: "A01-01",
        zone_id: "PICK",
        on_hand_qty: 100,
        reserved_qty: 10,
        available_qty: 90,
        quarantine_qty: 0
      },
      {
        sku_id: "SKU000002",
        sku_description: "Product B",
        location_id: "LOC002",
        location_code: "B01-01",
        zone_id: "STORAGE",
        on_hand_qty: 50,
        reserved_qty: 5,
        available_qty: 45,
        quarantine_qty: 0
      }
    ],
    total: 2
  });

});

/* ==============================
   COUNT PLANS
============================== */
router.get("/count-plans", requireRole(allowedRoles), (req, res) => {

  res.json({
    items: [
      {
        count_id: "CC000001",
        zone_id: "PICK",
        planned_date: "2026-03-15",
        lines_count: 10,
        status: "DRAFT"
      }
    ],
    total: 1
  });

});

/* ==============================
   COUNT PLAN DETAIL
============================== */
router.get("/count-plans/:id", requireRole(allowedRoles), (req, res) => {

  res.json({
    count_id: req.params.id,
    zone_id: "PICK",
    planned_date: "2026-03-15",
    status: "DRAFT",
    created_at: new Date(),

    lines: [
      {
        line_id: "LINE001",
        sku_id: "SKU000001",
        location_id: "LOC001",
        system_qty: 100,
        counted_qty: null,
        variance_qty: null,
        status: "OPEN"
      }
    ]
  });

});

/* ==============================
   ADJUSTMENTS LIST
============================== */
router.get("/adjustments", requireRole(allowedRoles), (req, res) => {

  res.json({
    items: [
      {
        adj_id: "ADJ000001",
        sku_id: "SKU000001",
        location_id: "LOC001",
        qty_delta: -5,
        reason_code: "DMG",
        status: "SUBMITTED",
        requested_at: new Date()
      }
    ],
    total: 1
  });

});

/* ==============================
   CREATE ADJUSTMENT
============================== */
router.post("/adjustments", requireRole(allowedRoles), (req, res) => {

  res.json({
    adj_id: "ADJ000002",
    ...req.body,
    status: "SUBMITTED",
    requested_at: new Date()
  });

});

export default router;