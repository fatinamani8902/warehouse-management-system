import { DataTypes } from "sequelize";

function defineLovValue(sequelize) {
  return sequelize.define("LovValue", {
    tenant_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lov_value_id: {
      type: DataTypes.TEXT,
      primaryKey: true,
    },
    lov_group_id: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    value_code: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    value_label: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    is_active: {
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
    tableName: "lov_values",
    timestamps: false,
  });
}

export { defineLovValue };
