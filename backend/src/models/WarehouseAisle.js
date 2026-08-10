import { DataTypes } from "sequelize";

function defineWarehouseAisle(sequelize) {
  return sequelize.define("WarehouseAisle", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    aisle_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    zone_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    aisle_code: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    aisle_name: {
      type: DataTypes.TEXT,
      allowNull: false,
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
    tableName: "warehouse_aisles",
    timestamps: false,
  });
}

export { defineWarehouseAisle };
