import { DataTypes } from "sequelize";

function definePutawayTaskEvent(sequelize) {
  return sequelize.define("PutawayTaskEvent", {
    event_id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.TEXT, allowNull: false },
    task_id: { type: DataTypes.TEXT, allowNull: false },
    event_type: { type: DataTypes.TEXT, allowNull: false },
    event_payload: { type: DataTypes.JSONB },
    created_by: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    tableName: "putaway_task_events",
    timestamps: false,
  });
}

export { definePutawayTaskEvent };
