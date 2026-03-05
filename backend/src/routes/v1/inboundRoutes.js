import express from "express";
import * as masterDataService from "../../services/masterDataService.js";

const router = express.Router();

/* =======================================
   STUB DATA
======================================= */

const inboundStub = [
  // ASN
  {
    asn_id: "ASN000001",
    supplier_name: "ABC Supplier",
    created_at: new Date().toISOString(),
    eta: "2026-03-10",
    lines_count: 3,
    status: "draft",
    cancellation_reason: null,
  },
  {
    asn_id: "ASN000002",
    supplier_name: "XYZ Trading",
    created_at: new Date().toISOString(),
    eta: "2026-03-12",
    lines_count: 5,
    status: "pending",
    cancellation_reason: null,
  },

  // GRN
  {
    grn_id: "GRN000001",
    asn_id: "ASN000001",
    supplier_name: "ABC Supplier",
    created_at: new Date().toISOString(),
    received_date: "2026-03-05",
    status: "receiving",
    lines: [
      { line_no: 1, sku_id: "SKU001", expected_qty: 10, received_qty: 8 },
    ],
    cancellation_reason: null,
  },
  {
    grn_id: "GRN000002",
    asn_id: "ASN000002",
    supplier_name: "XYZ Trading",
    created_at: new Date().toISOString(),
    received_date: "2026-03-06",
    status: "completed",
    lines: [
      { line_no: 1, sku_id: "SKU002", expected_qty: 5, received_qty: 5 },
    ],
    cancellation_reason: null,
  },
];

/* =======================================
   HELPER - PAGINATION
======================================= */

function paginate(array, page = 1, pageSize = 10) {
  const currentPage = Number(page) || 1;
  const size = Number(pageSize) || 10;

  const total = array.length;
  const totalPages = Math.ceil(total / size);

  const start = (currentPage - 1) * size;
  const end = start + size;

  const items = array.slice(start, end);

  return {
    items,
    pagination: {
      page: currentPage,
      pageSize: size,
      total,
      totalPages,
    },
  };
}

/* =======================================
   ASN ROUTES
======================================= */

router.get("/asn", (req, res) => {
  const { page = 1, pageSize = 10 } = req.query;

  const asnList = inboundStub.filter((i) => i.asn_id);

  const { items, pagination } = paginate(asnList, page, pageSize);

  res.json({
    success: true,
    data: items,
    meta: {
      pagination,
    },
  });
});

router.get("/asn/:id", (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.params.id,
      type: "asn",
      tenantId: "TEN001",
      status: "CREATED",
      createdAt: new Date().toISOString(),
    },
  });
});

router.post("/asn", (req, res) => {

  const supplierId = req.body.supplier_id;

// cari supplier dalam master data
const supplier = masterDataService.getResource(
  req.context,
  "suppliers",
  supplierId
);

const supplierName = supplier ? supplier.supplier_name : `Supplier ${supplierId}`;

const asnCount = inboundStub.filter(i => i.asn_id).length + 1;

const newAsn = {
  asn_id: `ASN${String(asnCount).padStart(6, "0")}`,
  supplier_id: supplierId,
  supplier_name: supplierName,
    created_at: new Date().toISOString(),
    eta: req.body.eta,
    lines_count: req.body.lines_count,
    status: "draft",
    cancellation_reason: null,
  };

  inboundStub.push(newAsn);

  res.json({
    success: true,
    data: newAsn
  });

});

router.put("/asn/:id", (req, res) => {
  res.json({
    success: true,
    message: "ASN updated successfully",
    data: {
      id: req.params.id,
      ...req.body,
    },
  });
});

router.delete("/asn/:id", (req, res) => {

  const index = inboundStub.findIndex(i => i.asn_id === req.params.id);

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: "ASN not found"
    });
  }

  const asn = inboundStub[index];

  if (asn.status !== "draft") {
    return res.status(400).json({
      success: false,
      message: "Only Draft ASN can be deleted"
    });
  }

  inboundStub.splice(index, 1);

  res.json({
    success: true,
    message: `ASN ${req.params.id} deleted successfully`
  });

});

/* =======================================
   GRN ROUTES
======================================= */

router.get("/grn", (req, res) => {
  const { page = 1, pageSize = 10 } = req.query;

  const grnList = inboundStub.filter((i) => i.grn_id);

  const { items, pagination } = paginate(grnList, page, pageSize);

  res.json({
    success: true,
    data: items,
    meta: {
      pagination,
    },
  });
});

router.get("/grn/:id", (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.params.id,
      type: "grn",
      tenantId: "TEN001",
      status: "RECEIVED",
      createdAt: new Date().toISOString(),
    },
  });
});

router.post("/grn", (req, res) => {
  res.json({
    success: true,
    message: "GRN created successfully",
    data: {
      id: "GRN000003",
      ...req.body,
      tenantId: "TEN001",
      status: "RECEIVED",
      createdAt: new Date().toISOString(),
    },
  });
});

router.put("/grn/:id", (req, res) => {
  res.json({
    success: true,
    message: "GRN updated successfully",
    data: {
      id: req.params.id,
      ...req.body,
    },
  });
});

router.delete("/grn/:id", (req, res) => {
  res.json({
    success: true,
    message: `GRN ${req.params.id} deleted successfully`,
  });
});

/* =======================================
   PROGRESS & CANCEL (STUB)
======================================= */

router.post("/asn/:id/submit", (req, res) => {

  const asn = inboundStub.find(i => i.asn_id === req.params.id);

  if (!asn) {
    return res.status(404).json({
      success: false,
      message: "ASN not found"
    });
  }

  asn.status = "pending";

  res.json({
    success: true,
    data: asn
  });

});



router.post("/asn/:id/:action", (req, res) => {

  const asn = inboundStub.find(i => i.asn_id === req.params.id);

  if (!asn) {
    return res.status(404).json({ message: "ASN not found" });
  }

  const action = req.params.action;

  if (action === "submit") {
    asn.status = "pending";
  }

  if (action === "mark_in_transit") {
    asn.status = "in_transit";
  }

  if (action === "mark_arrived") {
    asn.status = "arrived";
  }

  if (action === "close") {
    asn.status = "closed";
  }

  if (action === "cancel") {
  asn.status = "cancelled";
  asn.cancellation_reason = req.body?.cancellation_reason || null;
}

  res.json({
    success: true,
    data: asn
  });

});

router.post("/grn/:id/progress", (req, res) => {
  res.json({
    success: true,
    message: `GRN ${req.params.id} progressed successfully`,
  });
});

router.post("/asn/:id/cancel", (req, res) => {

  const asn = inboundStub.find(i => i.asn_id === req.params.id);

  if (!asn) {
    return res.status(404).json({
      success: false,
      message: "ASN not found"
    });
  }

  asn.status = "cancelled";
asn.cancellation_reason = req.body?.cancellation_reason ?? "Cancelled by user";

  res.json({
    success: true,
    data: asn
  });

});

router.post("/grn/:id/cancel", (req, res) => {
  res.json({
    success: true,
    message: `GRN ${req.params.id} cancelled successfully`,
  });
});

export default router;