import { DataTypes } from "sequelize";

function defineSupplier(sequelize) {
  return sequelize.define("Supplier", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    supplier_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    supplier_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    supplier_code: {
      type: DataTypes.TEXT,
    },
    contact_person: {
      type: DataTypes.TEXT,
    },
    email: {
      type: DataTypes.TEXT,
    },
    phone: {
      type: DataTypes.TEXT,
    },
    address: {
      type: DataTypes.TEXT,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: "suppliers",
    timestamps: false,
  });
}

export { defineSupplier };
