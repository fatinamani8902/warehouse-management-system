import { DataTypes } from "sequelize";

function definePutawayTask(sequelize) {
  return sequelize.define("PutawayTask", {
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    putaway_task_id: { type: DataTypes.TEXT, primaryKey: true },
    task_id: { type: DataTypes.TEXT },
    warehouse_id: { type: DataTypes.TEXT, allowNull: false },
    grn_id: { type: DataTypes.TEXT },
    grn_line_id: { type: DataTypes.TEXT },
    sku_id: { type: DataTypes.TEXT, allowNull: false },
    qty: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: false },
    priority: { type: DataTypes.INTEGER },
    assigned_to_user_id: { type: DataTypes.TEXT },
    from_location_id: { type: DataTypes.TEXT },
    source_location_id: { type: DataTypes.TEXT },
    to_location_id: { type: DataTypes.TEXT },
    destination_location_id: { type: DataTypes.TEXT },
    lot_no: { type: DataTypes.TEXT },
    serial_no: { type: DataTypes.TEXT },
    reference_type: { type: DataTypes.TEXT },
    reference_id: { type: DataTypes.TEXT },
    posting_key: { type: DataTypes.TEXT },
    started_at: { type: DataTypes.DATE },
    completed_at: { type: DataTypes.DATE },
    completed_by: { type: DataTypes.TEXT },
    actual_bin_code: { type: DataTypes.TEXT },
    validation_result: { type: DataTypes.TEXT },
    exception_reason: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: "putaway_tasks",
    timestamps: false,
  });
}

export { definePutawayTask };
