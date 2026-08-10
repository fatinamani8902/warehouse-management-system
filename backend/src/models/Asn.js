import { DataTypes } from "sequelize";

function defineAsn(sequelize) {
  return sequelize.define("Asn", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    asn_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    warehouse_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    supplier_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    eta: {
      type: DataTypes.DATEONLY,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
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
    created_by: {
      type: DataTypes.TEXT,
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
  }, {
    tableName: "asns",
    timestamps: false,
  });
}

export { defineAsn };
