import { DataTypes } from "sequelize";

function defineSalesOrderLine(sequelize) {
  return sequelize.define("SalesOrderLine", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    so_line_id: { type: DataTypes.TEXT, primaryKey: true },
    so_id: { type: DataTypes.TEXT, allowNull: false },
    line_no: { type: DataTypes.INTEGER, allowNull: false },
    sku_id: { type: DataTypes.TEXT, allowNull: false },
    ordered_qty: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    allocated_qty: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    shipped_qty: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    uom: { type: DataTypes.TEXT, allowNull: false },
  }, {
    tableName: "sales_order_lines",
    timestamps: false,
  });
}

export { defineSalesOrderLine };
