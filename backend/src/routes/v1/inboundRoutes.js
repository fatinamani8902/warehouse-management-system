import express from "express";
import {
  createAsn as createDatabaseAsn,
  getAsn as getDatabaseAsn,
  listAsns as listDatabaseAsns,
  transitionAsn as transitionDatabaseAsn,
} from "../../services/asnService.js";
import {
  createGrn as createDatabaseGrn,
  getGrn as getDatabaseGrn,
  listGrns as listDatabaseGrns,
  transitionGrn as transitionDatabaseGrn,
  updateGrnLines as updateDatabaseGrnLines,
} from "../../services/grnService.js";

const router = express.Router();

/* =======================================
   ASN ROUTES
======================================= */

router.get("/asn", async (req, res, next) => {
  try {
    const asns = await listDatabaseAsns(req.context?.tenantId);
    return res.json({ success: true, data: asns });
  } catch (err) {
    return next(err);
  }
});

router.get("/asn/:id", async (req, res, next) => {
  try {
    const asn = await getDatabaseAsn(req.context?.tenantId, req.params.id);
    if (!asn) return res.status(404).json({ success: false, message: "ASN not found" });
    return res.json({ success: true, data: asn });
  } catch (err) {
    return next(err);
  }
});

router.post("/asn", async (req, res, next) => {
  try {
    const asn = await createDatabaseAsn(req.context, req.body);
    return res.status(201).json({ success: true, data: asn });
  } catch (err) {
    return next(err);
  }
});

/* =======================================
   ASN TRANSITIONS
======================================= */

router.post("/asn/:id/:action", async (req, res, next) => {
  try {
    const { id, action } = req.params;
    const asn = await transitionDatabaseAsn(req.context, id, action, req.body);
    return res.json({ success: true, data: asn });
  } catch (err) {
    return next(err);
  }
});

/* =======================================
   GRN ROUTES
======================================= */

router.get("/grn", async (req, res, next) => {
  try {
    const grns = await listDatabaseGrns(req.context?.tenantId, req.query);
    return res.json({ success: true, data: grns });
  } catch (err) {
    return next(err);
  }
});

router.get("/grn/:id", async (req, res, next) => {
  try {
    const grn = await getDatabaseGrn(req.context?.tenantId, req.params.id);
    if (!grn) return res.status(404).json({ success: false, message: "GRN not found" });
    return res.json({ success: true, data: grn });
  } catch (err) {
    return next(err);
  }
});

router.post("/grn", async (req, res, next) => {
  try {
    const grn = await createDatabaseGrn(req.context, req.body);
    return res.status(201).json({ success: true, data: grn });
  } catch (err) {
    return next(err);
  }
});

/* =======================================
   GRN TRANSITIONS
======================================= */

router.post("/grn/:id/:action", async (req, res, next) => {
  try {
    const { id, action } = req.params;
    const grn = await transitionDatabaseGrn(req.context, id, action, req.body);
    return res.json({ success: true, data: grn });
  } catch (err) {
    return next(err);
  }
});

router.patch("/grn/:id/lines", async (req, res, next) => {
  try {
    const grn = await updateDatabaseGrnLines(req.context, req.params.id, req.body?.lines);
    return res.json({ success: true, data: grn });
  } catch (err) {
    return next(err);
  }
});

export default router;
