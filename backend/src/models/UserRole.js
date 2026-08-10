import { DataTypes } from "sequelize";

function defineUserRole(sequelize) {
  return sequelize.define("UserRole", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true },
    role_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true },
  }, {
    tableName: "user_roles",
    timestamps: false,
  });
}

export { defineUserRole };
