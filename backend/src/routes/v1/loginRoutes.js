import express from "express";
import { findActiveUserByEmail } from "../../repositories/AuthRepository.js";

const router = express.Router();

router.post("/login", async (req, res, next) => {
  const email    = String(req.body?.email    || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  if (process.env.NODE_ENV === "development") {
    try {
      const dbUser = await findActiveUserByEmail(email);
      if (!dbUser || !dbUser.role_id) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      }

      const user = {
        user_id: dbUser.user_id,
        email: dbUser.email,
        full_name: dbUser.user_name,
        role_id: dbUser.role_id,
        role_name: dbUser.role_name,
        tenant_id: dbUser.tenant_id,
        warehouse_ids: dbUser.warehouse_ids,
      };

      const session = {
        token: `dev-token-${dbUser.user_id}-${Date.now()}`,
        tenant_id: dbUser.tenant_id,
        user_id: dbUser.user_id,
        role_id: dbUser.role_id,
      };

      return res.json({ success: true, user, session });
    } catch (error) {
      return next(error);
    }
  }

  return res.status(501).json({
    success: false,
    message: "Production login not yet implemented",
  });
});

export default router;
