import express from "express";

const router = express.Router();

// In-memory store untuk LOV groups
const lovStore = [
  {
    id: "packaging_types",
    name: "Packaging Types",
    values: ["standard_box", "pallet_wrap", "bubble_wrap", "crate", "envelope"],
    usedIn: ["Packing", "Shipping"],
    lastUpdated: "2026-01-15",
  },
  {
    id: "carriers",
    name: "Carriers",
    values: ["DHL Express", "FedEx Ground", "UPS Standard", "Pos Malaysia", "J&T Express"],
    usedIn: ["Shipping"],
    lastUpdated: "2026-01-20",
  },
  {
    id: "adjustment_reasons",
    name: "Adjustment Reasons",
    values: ["DAMAGED", "MISCOUNTED", "QUALITY_HOLD", "SYSTEM_ERROR", "CYCLE_VARIANCE"],
    usedIn: ["Inventory"],
    lastUpdated: "2026-02-01",
  },
  {
    id: "exception_types",
    name: "Exception Types",
    values: ["COUNT_MISMATCH", "DAMAGED_GOODS", "WRONG_LOCATION", "SYSTEM_ERROR", "OTHER"],
    usedIn: ["Trace", "Inbound"],
    lastUpdated: "2026-02-05",
  },
  {
    id: "uom",
    name: "Units of Measure",
    values: ["EA", "BOX", "PAIR", "KG", "LTR", "SET"],
    usedIn: ["Master Data", "Inbound"],
    lastUpdated: "2025-12-10",
  },
  {
    id: "zones",
    name: "Zone Types",
    values: ["dock", "storage", "picking", "packing", "quarantine", "staging"],
    usedIn: ["Master Data", "Inventory"],
    lastUpdated: "2026-01-08",
  },
];

// GET ALL GROUPS
router.get("/groups", (req, res) => {
  const search = String(req.query.search || "").toLowerCase();
  const filtered = search
    ? lovStore.filter((g) => g.name.toLowerCase().includes(search) || g.id.toLowerCase().includes(search))
    : lovStore;

  res.json({ success: true, data: filtered });
});

// GET GROUP BY ID
router.get("/groups/:id", (req, res) => {
  const group = lovStore.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ success: false, message: "Group not found" });
  res.json({ success: true, data: group });
});

// CREATE GROUP
router.post("/groups", (req, res) => {
  const { id, name, usedIn = [] } = req.body;
  if (!id || !name) return res.status(400).json({ success: false, message: "id and name are required" });
  if (lovStore.find((g) => g.id === id)) {
    return res.status(400).json({ success: false, message: "Group ID already exists" });
  }
  const group = {
    id,
    name,
    values: [],
    usedIn,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
  lovStore.push(group);
  res.status(201).json({ success: true, data: group });
});

// ADD VALUE TO GROUP
router.post("/groups/:id/values", (req, res) => {
  const group = lovStore.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ success: false, message: "Group not found" });

  const { value } = req.body;
  if (!value || !String(value).trim()) {
    return res.status(400).json({ success: false, message: "value is required" });
  }

  const trimmed = String(value).trim();
  if (group.values.includes(trimmed)) {
    return res.status(400).json({ success: false, message: "Value already exists in this group" });
  }

  group.values.push(trimmed);
  group.lastUpdated = new Date().toISOString().slice(0, 10);

  res.json({ success: true, data: group });
});

// UPDATE VALUE IN GROUP
router.put("/groups/:id/values/:valueIndex", (req, res) => {
  const group = lovStore.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ success: false, message: "Group not found" });

  const idx = Number(req.params.valueIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= group.values.length) {
    return res.status(404).json({ success: false, message: "Value not found" });
  }

  const { value } = req.body;
  if (!value || !String(value).trim()) {
    return res.status(400).json({ success: false, message: "value is required" });
  }

  group.values[idx] = String(value).trim();
  group.lastUpdated = new Date().toISOString().slice(0, 10);

  res.json({ success: true, data: group });
});

// DELETE VALUE FROM GROUP
router.delete("/groups/:id/values/:valueIndex", (req, res) => {
  const group = lovStore.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ success: false, message: "Group not found" });

  const idx = Number(req.params.valueIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= group.values.length) {
    return res.status(404).json({ success: false, message: "Value not found" });
  }

  group.values.splice(idx, 1);
  group.lastUpdated = new Date().toISOString().slice(0, 10);

  res.json({ success: true, data: group });
});

export default router;