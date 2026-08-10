import { DataTypes } from "sequelize";

function defineSalesOrder(sequelize) {
  return sequelize.define("SalesOrder", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    so_id: { type: DataTypes.TEXT, primaryKey: true },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false },
    customer_id: { type: DataTypes.TEXT, allowNull: false },
    order_date: { type: DataTypes.DATEONLY, allowNull: false },
    ship_by_date: { type: DataTypes.DATEONLY },
    status: { type: DataTypes.TEXT, allowNull: false },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false },
    created_by: { type: DataTypes.TEXT },
    updated_at: { type: DataTypes.DATE, allowNull: false },
    cancelled_at: { type: DataTypes.DATE },
    cancellation_reason: { type: DataTypes.TEXT },
  }, {
    tableName: "sales_orders",
    timestamps: false,
  });
}

export { defineSalesOrder };
