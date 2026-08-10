import { DataTypes } from "sequelize";

function defineGrn(sequelize) {
  return sequelize.define("Grn", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    grn_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    warehouse_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    asn_id: {
      type: DataTypes.TEXT,
    },
    supplier_id: {
      type: DataTypes.TEXT,
    },
    received_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    received_by: {
      type: DataTypes.TEXT,
    },
    notes: {
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
    cancelled_at: {
      type: DataTypes.DATE,
    },
    cancelled_by: {
      type: DataTypes.TEXT,
    },
    cancellation_reason: {
      type: DataTypes.TEXT,
    },
    posted_at: {
      type: DataTypes.DATE,
    },
    posted_by: {
      type: DataTypes.TEXT,
    },
  }, {
    tableName: "grns",
    timestamps: false,
  });
}

export { defineGrn };
