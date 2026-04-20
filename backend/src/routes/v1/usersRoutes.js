import express from "express";
import { db } from "../../data/store.js";

const router = express.Router();

// GET USERS
router.get("/", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const users = db.users
      .filter((u) => u.tenant_id === tenantId)
      .map((u) => ({
        user_id: u.user_id,
        user_name: u.user_name,
        email: u.email && u.email !== "-" ? u.email : null,
        role_id: u.role_id,
        tenant_id: u.tenant_id,
        warehouse_ids: u.warehouse_ids,
        is_active: u.is_active,
        lastLogin: u.lastLogin || null,
      }));

    res.json({
      success: true,
      data: users,
      meta: {
        pagination: {
          page,
          pageSize: limit,
          total: users.length,
          totalPages: Math.ceil(users.length / limit),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET USER BY ID
router.get("/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const user = db.users.find(
      (u) => u.tenant_id === tenantId && u.user_id === req.params.id
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      data: {
        user_id: user.user_id,
        user_name: user.user_name,
        email: user.email || null,
        role_id: user.role_id,
        tenant_id: user.tenant_id,
        warehouse_ids: user.warehouse_ids,
        is_active: user.is_active,
        lastLogin: user.lastLogin || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE USER
router.post("/", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const { user_name, name, email, role_id, warehouse_ids } = req.body;

    const resolvedName = user_name || name;
    if (!resolvedName || !role_id) {
      return res.status(400).json({ success: false, message: "user_name and role_id are required" });
    }

    const maxId = db.users.reduce((max, u) => {
      const match = /USR(\d+)/.exec(u.user_id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    const newUser = {
      user_id: `USR${String(maxId + 1).padStart(6, "0")}`,
      user_name: resolvedName.trim(),
      email: email || "",
      role_id: role_id.toLowerCase(),
      tenant_id: tenantId,
      warehouse_ids: Array.isArray(warehouse_ids) ? warehouse_ids : ["WH000001"],
      is_active: true,
      lastLogin: null,
    };

    db.users.push(newUser);
    res.status(201).json({ success: true, data: newUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE USER
router.put("/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const idx = db.users.findIndex(
      (u) => u.tenant_id === tenantId && u.user_id === req.params.id
    );

    if (idx === -1) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { user_name, name, email, role_id, is_active, warehouse_ids } = req.body;
    const resolvedName = user_name || name;

    db.users[idx] = {
      ...db.users[idx],
      user_name: resolvedName ?? db.users[idx].user_name,
      email: email ?? db.users[idx].email,
      role_id: role_id ?? db.users[idx].role_id,
      is_active: is_active !== undefined ? Boolean(is_active) : db.users[idx].is_active,
      warehouse_ids: Array.isArray(warehouse_ids) ? warehouse_ids : db.users[idx].warehouse_ids,
    };

    res.json({ success: true, data: db.users[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE USER
router.delete("/:id", (req, res) => {
  try {
    const tenantId = req.context?.tenantId || req.headers["x-tenant-id"] || "TNT000001";
    const idx = db.users.findIndex(
      (u) => u.tenant_id === tenantId && u.user_id === req.params.id
    );

    if (idx === -1) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    db.users.splice(idx, 1);
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;