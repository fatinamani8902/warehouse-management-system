import { DataTypes } from "sequelize";

function definePackingTask(sequelize) {
  return sequelize.define("PackingTask", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    pack_task_id: { type: DataTypes.TEXT, primaryKey: true },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false },
    so_id: { type: DataTypes.TEXT, allowNull: false },
    wave_id: { type: DataTypes.TEXT },
    status: { type: DataTypes.TEXT, allowNull: false },
    carton_id: { type: DataTypes.TEXT },
    packaging_type: { type: DataTypes.TEXT },
    weight_kg: { type: DataTypes.DECIMAL(12, 4) },
    packed_by: { type: DataTypes.TEXT },
    packed_at: { type: DataTypes.DATE },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: "packing_tasks",
    timestamps: false,
  });
}

export { definePackingTask };
