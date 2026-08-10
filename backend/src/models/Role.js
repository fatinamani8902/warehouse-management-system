import { DataTypes } from "sequelize";

function defineRole(sequelize) {
  return sequelize.define("Role", {
    role_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    role_name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  }, {
    tableName: "roles",
    timestamps: false,
  });
}

export { defineRole };
