import { DataTypes } from "sequelize";

function defineWarehouseZone(sequelize) {
  return sequelize.define("WarehouseZone", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    zone_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    warehouse_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    zone_code: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    zone_name: {
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
    zone_type: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  }, {
    tableName: "warehouse_zones",
    timestamps: false,
  });
}

export { defineWarehouseZone };
