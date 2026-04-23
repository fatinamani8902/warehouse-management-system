import express from "express";

const router = express.Router();

router.post("/login", (req, res) => {
  const email    = String(req.body?.email    || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  if (process.env.NODE_ENV === "development") {
    const userId   = req.headers["x-user-id"]  || "USR000001";
    const tenantId = req.headers["x-tenant-id"] || "TNT000001";
    const roleId   = req.headers["x-roles"]     || "superadmin";

    const user = {
      user_id:    userId,
      email:      email,
      full_name:  email.split("@")[0],
      role_id:    roleId,
      tenant_id:  tenantId,
      // warehouse_id intentionally omitted — user must select warehouse
    };

    const session = {
      token:     `dev-token-${userId}-${Date.now()}`,
      tenant_id: tenantId,
      user_id:   userId,
      role_id:   roleId,
    };

    return res.json({ success: true, user, session });
  }

  return res.status(501).json({
    success: false,
    message: "Production login not yet implemented",
  });
});

export default router;