import { DataTypes } from "sequelize";

function defineUserWarehouse(sequelize) {
  return sequelize.define("UserWarehouse", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true },
    user_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false, primaryKey: true },
  }, {
    tableName: "user_warehouses",
    timestamps: false,
  });
}

export { defineUserWarehouse };
