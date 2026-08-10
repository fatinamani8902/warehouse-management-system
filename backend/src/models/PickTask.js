import { DataTypes } from "sequelize";

function definePickTask(sequelize) {
  return sequelize.define("PickTask", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    pick_task_id: { type: DataTypes.TEXT, primaryKey: true },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false },
    wave_id: { type: DataTypes.TEXT },
    so_id: { type: DataTypes.TEXT, allowNull: false },
    so_line_id: { type: DataTypes.TEXT, allowNull: false },
    sku_id: { type: DataTypes.TEXT, allowNull: false },
    from_location_id: { type: DataTypes.TEXT, allowNull: false },
    qty: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    picked_qty: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    lot_no: { type: DataTypes.TEXT },
    serial_no: { type: DataTypes.TEXT },
    status: { type: DataTypes.TEXT, allowNull: false },
    assigned_to_user_id: { type: DataTypes.TEXT },
    picked_by: { type: DataTypes.TEXT },
    started_at: { type: DataTypes.DATE },
    completed_at: { type: DataTypes.DATE },
    notes: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: "pick_tasks",
    timestamps: false,
  });
}

export { definePickTask };
