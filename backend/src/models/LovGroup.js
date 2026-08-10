import { DataTypes } from "sequelize";

function defineLovGroup(sequelize) {
  return sequelize.define("LovGroup", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lov_group_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    group_code: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    group_name: {
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
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: "lov_groups",
    timestamps: false,
  });
}

export { defineLovGroup };
