import { DataTypes } from "sequelize";

function defineInventoryTransaction(sequelize) {
  return sequelize.define("InventoryTransaction", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    itx_id: {
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
    from_location_id: {
      type: DataTypes.TEXT,
    },
    to_location_id: {
      type: DataTypes.TEXT,
    },
    qty: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    tx_type: {
      type: DataTypes.TEXT,
    },
    ref_type: {
      type: DataTypes.TEXT,
    },
    ref_id: {
      type: DataTypes.TEXT,
    },
    tx_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_by: {
      type: DataTypes.TEXT,
    },
    notes: {
      type: DataTypes.TEXT,
    },
    txn_id: {
      type: DataTypes.TEXT,
    },
    txn_type: {
      type: DataTypes.TEXT,
    },
    uom_id: {
      type: DataTypes.TEXT,
    },
    reference_type: {
      type: DataTypes.TEXT,
    },
    reference_id: {
      type: DataTypes.TEXT,
    },
    reason_code: {
      type: DataTypes.TEXT,
    },
    transaction_type: {
      type: DataTypes.TEXT,
    },
    posting_key: {
      type: DataTypes.TEXT,
    },
    lot_no: {
      type: DataTypes.TEXT,
    },
    serial_no: {
      type: DataTypes.TEXT,
    },
    created_at: {
      type: DataTypes.DATE,
    },
  }, {
    tableName: "inventory_transactions",
    timestamps: false,
  });
}

export { defineInventoryTransaction };
