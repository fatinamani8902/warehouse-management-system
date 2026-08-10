import { DataTypes } from "sequelize";

function defineAsnLine(sequelize) {
  return sequelize.define("AsnLine", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    asn_line_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    asn_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    line_no: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sku_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    expected_qty: {
      type: DataTypes.DECIMAL(18, 4),
      allowNull: false,
    },
    uom: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lot_no: {
      type: DataTypes.TEXT,
    },
    serial_no: {
      type: DataTypes.TEXT,
    },
    notes: {
      type: DataTypes.TEXT,
    },
  }, {
    tableName: "asn_lines",
    timestamps: false,
  });
}

export { defineAsnLine };
