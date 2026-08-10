import express from "express";
import {
  createLovGroup,
  createLovValue,
  deleteLovGroup,
  deleteLovValue,
  updateLovGroup,
  updateLovValue,
} from "../../repositories/MasterDataWriteRepository.js";

const router = express.Router();

function tenantId(req) {
  return req.context?.tenantId;
}

function sendError(res, error) {
  if (error?.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({ success: false, message: "An LOV record with the same code already exists" });
  }
  if (error?.name === "SequelizeForeignKeyConstraintError" || error?.parent?.code === "23503") {
    return res.status(409).json({ success: false, message: error.message || "The LOV record is referenced by another record" });
  }
  return res.status(error.statusCode || error.status || 500).json({ success: false, message: error.message || "Unexpected server error" });
}

router.post("/groups", async (req, res) => {
  try {
    return res.status(201).json({ success: true, data: await createLovGroup(tenantId(req), req.body) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/groups/:id", async (req, res) => {
  try {
    const group = await updateLovGroup(tenantId(req), req.params.id, req.body);
    if (!group) {
      return res.status(404).json({ success: false, message: "LOV group not found" });
    }
    return res.json({ success: true, data: group });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/groups/:id", async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }
    const result = await deleteLovGroup(tenantId(req), req.params.id);
    if (!result) {
      return res.status(404).json({ success: false, message: "LOV group not found" });
    }
    return res.json({ success: true, data: result.row });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post("/groups/:id/values", async (req, res) => {
  try {
    return res.status(201).json({ success: true, data: await createLovValue(tenantId(req), req.params.id, req.body) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put("/groups/:id/values/:lovValueId", async (req, res) => {
  try {
    const group = await updateLovValue(tenantId(req), req.params.id, req.params.lovValueId, req.body);
    if (!group) {
      return res.status(404).json({ success: false, message: "LOV value not found" });
    }
    return res.json({ success: true, data: group });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete("/groups/:id/values/:lovValueId", async (req, res) => {
  try {
    if (req.body?.confirmDelete !== true) {
      return res.status(400).json({ success: false, message: "confirmDelete=true is required" });
    }
    const result = await deleteLovValue(tenantId(req), req.params.id, req.params.lovValueId);
    if (!result) {
      return res.status(404).json({ success: false, message: "LOV value not found" });
    }
    return res.json({ success: true, data: result.row });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
