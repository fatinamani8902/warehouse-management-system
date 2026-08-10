import { DataTypes } from "sequelize";

function defineWarehouseBay(sequelize) {
  return sequelize.define("WarehouseBay", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    bay_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    aisle_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    bay_code: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    bay_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    width_cm: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
    },
    depth_cm: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
    },
    level_height_cm: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false,
    },
    level_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    max_weight_kg: {
      type: DataTypes.DECIMAL(12, 4),
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
    tableName: "warehouse_bays",
    timestamps: false,
  });
}

export { defineWarehouseBay };
