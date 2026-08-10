import { DataTypes } from "sequelize";

function defineReturnItem(sequelize) {
  return sequelize.define("ReturnItem", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    rmi_id: { type: DataTypes.TEXT, primaryKey: true },
    return_id: { type: DataTypes.TEXT, allowNull: false },
    sku_id: { type: DataTypes.TEXT, allowNull: false },
    qty: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    reason: { type: DataTypes.TEXT },
    reason_code: { type: DataTypes.TEXT },
    disposition: { type: DataTypes.TEXT, allowNull: false },
    received_qty: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    notes: { type: DataTypes.TEXT },
  }, {
    tableName: "return_items",
    timestamps: false,
  });
}

export { defineReturnItem };
