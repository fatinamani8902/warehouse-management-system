import { DataTypes } from "sequelize";

function defineCustomer(sequelize) {
  return sequelize.define("Customer", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    customer_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    customer_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    customer_code: {
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
    tableName: "customers",
    timestamps: false,
  });
}

export { defineCustomer };
