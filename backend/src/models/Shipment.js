import { DataTypes } from "sequelize";

function defineShipment(sequelize) {
  return sequelize.define("Shipment", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    shipment_id: { type: DataTypes.TEXT, primaryKey: true },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false },
    so_id: { type: DataTypes.TEXT, allowNull: false },
    pack_task_id: { type: DataTypes.TEXT },
    carrier: { type: DataTypes.TEXT },
    tracking_no: { type: DataTypes.TEXT },
    ship_date: { type: DataTypes.DATEONLY },
    status: { type: DataTypes.TEXT, allowNull: false },
    dispatched_at: { type: DataTypes.DATE },
    dispatched_by: { type: DataTypes.TEXT },
    closed_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, allowNull: false },
    created_by: { type: DataTypes.TEXT },
    updated_at: { type: DataTypes.DATE, allowNull: false },
    cancelled_at: { type: DataTypes.DATE },
    cancellation_reason: { type: DataTypes.TEXT },
  }, {
    tableName: "shipments",
    timestamps: false,
  });
}

export { defineShipment };
