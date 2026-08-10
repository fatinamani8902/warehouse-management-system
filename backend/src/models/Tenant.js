import { DataTypes } from "sequelize";

function defineTenant(sequelize) {
  return sequelize.define("Tenant", {
    tenant_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    tenant_name: {
      type: DataTypes.TEXT,
      allowNull: false,
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
    tableName: "tenants",
    timestamps: false,
  });
}

export { defineTenant };
