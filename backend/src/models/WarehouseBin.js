import { DataTypes } from "sequelize";

function defineWarehouseBin(sequelize) {
  return sequelize.define("WarehouseBin", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    bin_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    level_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    bin_code: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    max_weight: {
      type: DataTypes.DECIMAL(12, 4),
    },
    max_volume: {
      type: DataTypes.DECIMAL(12, 4),
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
    tableName: "warehouse_bins",
    timestamps: false,
  });
}

export { defineWarehouseBin };
