import { DataTypes } from "sequelize";

function defineWarehouseLevel(sequelize) {
  return sequelize.define("WarehouseLevel", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    level_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    bay_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    level_code: {
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
    tableName: "warehouse_levels",
    timestamps: false,
  });
}

export { defineWarehouseLevel };
