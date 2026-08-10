import { DataTypes } from "sequelize";

function defineSku(sequelize) {
  return sequelize.define("Sku", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    sku_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    sku_code: {
      type: DataTypes.TEXT,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    uom: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.TEXT,
    },
    hazardous: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    weight: {
      type: DataTypes.DECIMAL(12, 4),
    },
    dimensions: {
      type: DataTypes.TEXT,
    },
    reorder_point: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    reorder_qty: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    qr_payload: {
      type: DataTypes.TEXT,
    },
    rfid_epc: {
      type: DataTypes.TEXT,
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
    tableName: "skus",
    timestamps: false,
  });
}

export { defineSku };
