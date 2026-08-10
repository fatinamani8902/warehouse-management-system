import { DataTypes } from "sequelize";

function definePickWave(sequelize) {
  return sequelize.define("PickWave", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    wave_id: { type: DataTypes.TEXT, primaryKey: true },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    created_by: { type: DataTypes.TEXT },
    cancellation_reason: { type: DataTypes.TEXT },
  }, {
    tableName: "pick_waves",
    timestamps: false,
  });
}

export { definePickWave };
