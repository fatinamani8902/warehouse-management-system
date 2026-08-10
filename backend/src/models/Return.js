import { DataTypes } from "sequelize";

function defineReturn(sequelize) {
  return sequelize.define("Return", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    return_id: { type: DataTypes.TEXT, primaryKey: true },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false },
    shipment_id: { type: DataTypes.TEXT },
    so_id: { type: DataTypes.TEXT },
    customer_id: { type: DataTypes.TEXT },
    customer_name: { type: DataTypes.TEXT },
    status: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    created_by: { type: DataTypes.TEXT },
    sku_id: { type: DataTypes.TEXT },
    qty: { type: DataTypes.DECIMAL(18, 3) },
    reason_code: { type: DataTypes.TEXT },
    reason_description: { type: DataTypes.TEXT },
    notes: { type: DataTypes.TEXT },
    updated_at: { type: DataTypes.DATE },
    cancelled_at: { type: DataTypes.DATE },
    cancelled_by: { type: DataTypes.TEXT },
    cancellation_reason: { type: DataTypes.TEXT },
    cancellation_reason_code: { type: DataTypes.TEXT },
    received_at: { type: DataTypes.DATE },
    closed_at: { type: DataTypes.DATE },
  }, {
    tableName: "returns",
    timestamps: false,
  });
}

export { defineReturn };
