import { DataTypes } from "sequelize";

function defineLocation(sequelize) {
  return sequelize.define("Location", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    location_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    warehouse_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    zone: {
      type: DataTypes.TEXT,
    },
    aisle: {
      type: DataTypes.TEXT,
    },
    rack: {
      type: DataTypes.TEXT,
    },
    bin: {
      type: DataTypes.TEXT,
    },
    label: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    location_type: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    bin_id: {
      type: DataTypes.TEXT,
    },
    location_code: {
      type: DataTypes.TEXT,
    },
    is_default_receiving: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
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
    tableName: "locations",
    timestamps: false,
  });
}

export { defineLocation };
