import { DataTypes } from "sequelize";

function defineWarehouse(sequelize) {
  return sequelize.define("Warehouse", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    warehouse_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    warehouse_code: {
      type: DataTypes.TEXT,
    },
    warehouse_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    city: {
      type: DataTypes.TEXT,
    },
    country: {
      type: DataTypes.TEXT,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: "warehouses",
    timestamps: false,
  });
}

export { defineWarehouse };
