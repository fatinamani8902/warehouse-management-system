import { DataTypes } from "sequelize";

function defineGrnLine(sequelize) {
  return sequelize.define("GrnLine", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    grn_line_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    grn_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    asn_line_id: {
      type: DataTypes.TEXT,
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
    received_qty: {
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
    qc_status: {
      type: DataTypes.TEXT,
    },
    putaway_qty: {
      type: DataTypes.DECIMAL(18, 4),
    },
    notes: {
      type: DataTypes.TEXT,
    },
  }, {
    tableName: "grn_lines",
    timestamps: false,
  });
}

export { defineGrnLine };
