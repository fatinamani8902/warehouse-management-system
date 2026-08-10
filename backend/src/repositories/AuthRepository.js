import { Op, fn, col, where } from "sequelize";
import {
  Role,
  User,
  UserRole,
  UserWarehouse,
} from "../models/index.js";

async function findActiveUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const user = await User.findOne({
    where: {
      is_active: true,
      [Op.and]: [
        where(fn("lower", col("email")), normalizedEmail),
      ],
    },
  });
  if (!user) return null;

  const [userRoles, warehouseLinks] = await Promise.all([
    UserRole.findAll({
      where: {
        tenant_id: user.tenant_id,
        user_id: user.user_id,
      },
      order: [["role_id", "ASC"]],
    }),
    UserWarehouse.findAll({
      where: {
        tenant_id: user.tenant_id,
        user_id: user.user_id,
      },
      order: [["warehouse_id", "ASC"]],
    }),
  ]);

  const roleId = userRoles[0]?.role_id || null;
  const role = roleId
    ? await Role.findOne({ where: { role_id: roleId } })
    : null;

  return {
    user_id: user.user_id,
    email: user.email,
    user_name: user.user_name,
    tenant_id: user.tenant_id,
    role_id: roleId,
    role_name: role?.role_name || roleId,
    warehouse_ids: warehouseLinks.map((link) => link.warehouse_id),
  };
}

export { findActiveUserByEmail };
