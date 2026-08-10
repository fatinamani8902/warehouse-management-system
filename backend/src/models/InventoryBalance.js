import { DataTypes } from "sequelize";

function defineInventoryBalance(sequelize) {
  return sequelize.define("InventoryBalance", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    inv_balance_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    warehouse_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    sku_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    location_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lot_no: {
      type: DataTypes.TEXT,
    },
    serial_no: {
      type: DataTypes.TEXT,
    },
    qty_on_hand: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    qty_reserved: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    qty_quarantine: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: "inventory_balances",
    timestamps: false,
  });
}

export { defineInventoryBalance };
