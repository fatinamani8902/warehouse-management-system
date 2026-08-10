import { sequelize } from "../db/sequelize.js";
import { defineInventoryBalance } from "./InventoryBalance.js";
import { defineInventoryTransaction } from "./InventoryTransaction.js";
import { defineSupplier } from "./Supplier.js";
import { defineCustomer } from "./Customer.js";
import { defineLocation } from "./Location.js";
import { defineRole } from "./Role.js";
import { defineSku } from "./Sku.js";
import { defineTenant } from "./Tenant.js";
import { defineUser } from "./User.js";
import { defineWarehouse } from "./Warehouse.js";
import { defineWarehouseZone } from "./WarehouseZone.js";
import { defineWarehouseAisle } from "./WarehouseAisle.js";
import { defineWarehouseBay } from "./WarehouseBay.js";
import { defineWarehouseLevel } from "./WarehouseLevel.js";
import { defineWarehouseBin } from "./WarehouseBin.js";
import { defineLovGroup } from "./LovGroup.js";
import { defineLovValue } from "./LovValue.js";
import { defineAsn } from "./Asn.js";
import { defineAsnLine } from "./AsnLine.js";
import { defineGrn } from "./Grn.js";
import { defineGrnLine } from "./GrnLine.js";
import { definePutawayTask } from "./PutawayTask.js";
import { definePutawayTaskEvent } from "./PutawayTaskEvent.js";
import { defineUserRole } from "./UserRole.js";
import { defineUserWarehouse } from "./UserWarehouse.js";
import { defineSalesOrder } from "./SalesOrder.js";
import { defineSalesOrderLine } from "./SalesOrderLine.js";
import { definePickWave } from "./PickWave.js";
import { definePickTask } from "./PickTask.js";
import { definePackingTask } from "./PackingTask.js";
import { defineShipment } from "./Shipment.js";
import { defineReturn } from "./Return.js";
import { defineReturnItem } from "./ReturnItem.js";

const Tenant = defineTenant(sequelize);
const User = defineUser(sequelize);
const Role = defineRole(sequelize);
const Warehouse = defineWarehouse(sequelize);
const Supplier = defineSupplier(sequelize);
const Customer = defineCustomer(sequelize);
const Sku = defineSku(sequelize);
const WarehouseZone = defineWarehouseZone(sequelize);
const WarehouseAisle = defineWarehouseAisle(sequelize);
const WarehouseBay = defineWarehouseBay(sequelize);
const WarehouseLevel = defineWarehouseLevel(sequelize);
const WarehouseBin = defineWarehouseBin(sequelize);
const Location = defineLocation(sequelize);
const InventoryBalance = defineInventoryBalance(sequelize);
const InventoryTransaction = defineInventoryTransaction(sequelize);
const LovGroup = defineLovGroup(sequelize);
const LovValue = defineLovValue(sequelize);
const Asn = defineAsn(sequelize);
const AsnLine = defineAsnLine(sequelize);
const Grn = defineGrn(sequelize);
const GrnLine = defineGrnLine(sequelize);
const PutawayTask = definePutawayTask(sequelize);
const PutawayTaskEvent = definePutawayTaskEvent(sequelize);
const UserRole = defineUserRole(sequelize);
const UserWarehouse = defineUserWarehouse(sequelize);
const SalesOrder = defineSalesOrder(sequelize);
const SalesOrderLine = defineSalesOrderLine(sequelize);
const PickWave = definePickWave(sequelize);
const PickTask = definePickTask(sequelize);
const PackingTask = definePackingTask(sequelize);
const Shipment = defineShipment(sequelize);
const Return = defineReturn(sequelize);
const ReturnItem = defineReturnItem(sequelize);

Tenant.hasMany(User, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
User.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
User.hasMany(UserRole, { foreignKey: "user_id", sourceKey: "user_id" });
UserRole.belongsTo(User, { foreignKey: "user_id", targetKey: "user_id" });
User.hasMany(UserWarehouse, { foreignKey: "user_id", sourceKey: "user_id" });
UserWarehouse.belongsTo(User, { foreignKey: "user_id", targetKey: "user_id" });

Tenant.hasMany(Warehouse, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
Warehouse.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });

Tenant.hasMany(Sku, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
Sku.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });

Tenant.hasMany(Supplier, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
Supplier.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });

Tenant.hasMany(Customer, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
Customer.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });

Tenant.hasMany(Location, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
Location.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });

Warehouse.hasMany(Location, { foreignKey: "warehouse_id", sourceKey: "warehouse_id" });
Location.belongsTo(Warehouse, { foreignKey: "warehouse_id", targetKey: "warehouse_id" });

Tenant.hasMany(WarehouseZone, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
WarehouseZone.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
Warehouse.hasMany(WarehouseZone, { foreignKey: "warehouse_id", sourceKey: "warehouse_id" });
WarehouseZone.belongsTo(Warehouse, { foreignKey: "warehouse_id", targetKey: "warehouse_id" });

Tenant.hasMany(WarehouseAisle, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
WarehouseAisle.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
WarehouseZone.hasMany(WarehouseAisle, { foreignKey: "zone_id", sourceKey: "zone_id" });
WarehouseAisle.belongsTo(WarehouseZone, { foreignKey: "zone_id", targetKey: "zone_id" });

Tenant.hasMany(WarehouseBay, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
WarehouseBay.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
WarehouseAisle.hasMany(WarehouseBay, { foreignKey: "aisle_id", sourceKey: "aisle_id" });
WarehouseBay.belongsTo(WarehouseAisle, { foreignKey: "aisle_id", targetKey: "aisle_id" });

Tenant.hasMany(WarehouseLevel, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
WarehouseLevel.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
WarehouseBay.hasMany(WarehouseLevel, { foreignKey: "bay_id", sourceKey: "bay_id" });
WarehouseLevel.belongsTo(WarehouseBay, { foreignKey: "bay_id", targetKey: "bay_id" });

Tenant.hasMany(WarehouseBin, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
WarehouseBin.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
WarehouseLevel.hasMany(WarehouseBin, { foreignKey: "level_id", sourceKey: "level_id" });
WarehouseBin.belongsTo(WarehouseLevel, { foreignKey: "level_id", targetKey: "level_id" });

Location.belongsTo(WarehouseBin, { as: "warehouseBin", foreignKey: "bin_id", targetKey: "bin_id" });
WarehouseBin.hasMany(Location, { foreignKey: "bin_id", sourceKey: "bin_id" });

Tenant.hasMany(LovGroup, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
LovGroup.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
LovGroup.hasMany(LovValue, { foreignKey: "lov_group_id", sourceKey: "lov_group_id" });
LovValue.belongsTo(LovGroup, { foreignKey: "lov_group_id", targetKey: "lov_group_id" });

Tenant.hasMany(Asn, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
Asn.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
Warehouse.hasMany(Asn, { foreignKey: "warehouse_id", sourceKey: "warehouse_id" });
Asn.belongsTo(Warehouse, { foreignKey: "warehouse_id", targetKey: "warehouse_id" });
Supplier.hasMany(Asn, { foreignKey: "supplier_id", sourceKey: "supplier_id" });
Asn.belongsTo(Supplier, { as: "supplier", foreignKey: "supplier_id", targetKey: "supplier_id" });
User.hasMany(Asn, { foreignKey: "created_by", sourceKey: "user_id" });
Asn.belongsTo(User, { as: "creator", foreignKey: "created_by", targetKey: "user_id" });

Asn.hasMany(AsnLine, { as: "lines", foreignKey: "asn_id", sourceKey: "asn_id" });
AsnLine.belongsTo(Asn, { foreignKey: "asn_id", targetKey: "asn_id" });
Sku.hasMany(AsnLine, { foreignKey: "sku_id", sourceKey: "sku_id" });
AsnLine.belongsTo(Sku, { as: "sku", foreignKey: "sku_id", targetKey: "sku_id" });

Tenant.hasMany(Grn, { foreignKey: "tenant_id", sourceKey: "tenant_id" });
Grn.belongsTo(Tenant, { foreignKey: "tenant_id", targetKey: "tenant_id" });
Warehouse.hasMany(Grn, { foreignKey: "warehouse_id", sourceKey: "warehouse_id" });
Grn.belongsTo(Warehouse, { foreignKey: "warehouse_id", targetKey: "warehouse_id" });
Supplier.hasMany(Grn, { foreignKey: "supplier_id", sourceKey: "supplier_id" });
Grn.belongsTo(Supplier, { as: "supplier", foreignKey: "supplier_id", targetKey: "supplier_id" });
Asn.hasMany(Grn, { foreignKey: "asn_id", sourceKey: "asn_id" });
Grn.belongsTo(Asn, { as: "asn", foreignKey: "asn_id", targetKey: "asn_id" });
User.hasMany(Grn, { foreignKey: "received_by", sourceKey: "user_id" });
Grn.belongsTo(User, { as: "receiver", foreignKey: "received_by", targetKey: "user_id" });
User.hasMany(Grn, { foreignKey: "posted_by", sourceKey: "user_id" });
Grn.belongsTo(User, { as: "poster", foreignKey: "posted_by", targetKey: "user_id" });

Grn.hasMany(GrnLine, { as: "lines", foreignKey: "grn_id", sourceKey: "grn_id" });
GrnLine.belongsTo(Grn, { foreignKey: "grn_id", targetKey: "grn_id" });
AsnLine.hasMany(GrnLine, { foreignKey: "asn_line_id", sourceKey: "asn_line_id" });
GrnLine.belongsTo(AsnLine, { as: "asnLine", foreignKey: "asn_line_id", targetKey: "asn_line_id" });
Sku.hasMany(GrnLine, { foreignKey: "sku_id", sourceKey: "sku_id" });
GrnLine.belongsTo(Sku, { as: "sku", foreignKey: "sku_id", targetKey: "sku_id" });

Warehouse.hasMany(PutawayTask, { foreignKey: "warehouse_id", sourceKey: "warehouse_id" });
PutawayTask.belongsTo(Warehouse, { foreignKey: "warehouse_id", targetKey: "warehouse_id" });
Sku.hasMany(PutawayTask, { foreignKey: "sku_id", sourceKey: "sku_id" });
PutawayTask.belongsTo(Sku, { foreignKey: "sku_id", targetKey: "sku_id" });
PutawayTask.belongsTo(User, { as: "assignedUser", foreignKey: "assigned_to_user_id", targetKey: "user_id" });
PutawayTask.belongsTo(Location, { as: "sourceLocation", foreignKey: "source_location_id", targetKey: "location_id" });
PutawayTask.belongsTo(Location, { as: "fromLocation", foreignKey: "from_location_id", targetKey: "location_id" });
PutawayTask.belongsTo(Location, { as: "destinationLocation", foreignKey: "destination_location_id", targetKey: "location_id" });
PutawayTask.belongsTo(Location, { as: "toLocation", foreignKey: "to_location_id", targetKey: "location_id" });
PutawayTask.hasMany(PutawayTaskEvent, { foreignKey: "task_id", sourceKey: "putaway_task_id" });
PutawayTaskEvent.belongsTo(PutawayTask, { foreignKey: "task_id", targetKey: "putaway_task_id" });

Customer.hasMany(SalesOrder, { foreignKey: "customer_id", sourceKey: "customer_id" });
SalesOrder.belongsTo(Customer, { as: "customer", foreignKey: "customer_id", targetKey: "customer_id" });
SalesOrder.hasMany(SalesOrderLine, { as: "lines", foreignKey: "so_id", sourceKey: "so_id" });
SalesOrderLine.belongsTo(SalesOrder, { foreignKey: "so_id", targetKey: "so_id" });
SalesOrderLine.belongsTo(Sku, { as: "sku", foreignKey: "sku_id", targetKey: "sku_id" });
PickWave.hasMany(PickTask, { as: "tasks", foreignKey: "wave_id", sourceKey: "wave_id" });
PickTask.belongsTo(PickWave, { foreignKey: "wave_id", targetKey: "wave_id" });
PickTask.belongsTo(Sku, { as: "sku", foreignKey: "sku_id", targetKey: "sku_id" });
PickTask.belongsTo(Location, { as: "sourceLocation", foreignKey: "from_location_id", targetKey: "location_id" });
PickTask.belongsTo(User, { as: "assignedUser", foreignKey: "assigned_to_user_id", targetKey: "user_id" });
PackingTask.belongsTo(PickWave, { as: "wave", foreignKey: "wave_id", targetKey: "wave_id" });
PackingTask.belongsTo(SalesOrder, { as: "order", foreignKey: "so_id", targetKey: "so_id" });
PackingTask.belongsTo(User, { as: "packedByUser", foreignKey: "packed_by", targetKey: "user_id" });
Shipment.belongsTo(SalesOrder, { as: "order", foreignKey: "so_id", targetKey: "so_id" });
Shipment.belongsTo(PackingTask, { as: "packingTask", foreignKey: "pack_task_id", targetKey: "pack_task_id" });
Shipment.belongsTo(User, { as: "dispatcher", foreignKey: "dispatched_by", targetKey: "user_id" });
Return.hasMany(ReturnItem, { as: "items", foreignKey: "return_id", sourceKey: "return_id" });
ReturnItem.belongsTo(Return, { foreignKey: "return_id", targetKey: "return_id" });
ReturnItem.belongsTo(Sku, { as: "sku", foreignKey: "sku_id", targetKey: "sku_id" });

Warehouse.hasMany(InventoryBalance, { foreignKey: "warehouse_id", sourceKey: "warehouse_id" });
InventoryBalance.belongsTo(Warehouse, { foreignKey: "warehouse_id", targetKey: "warehouse_id" });

Sku.hasMany(InventoryBalance, { foreignKey: "sku_id", sourceKey: "sku_id" });
InventoryBalance.belongsTo(Sku, { foreignKey: "sku_id", targetKey: "sku_id" });

Location.hasMany(InventoryBalance, { foreignKey: "location_id", sourceKey: "location_id" });
InventoryBalance.belongsTo(Location, { foreignKey: "location_id", targetKey: "location_id" });

Warehouse.hasMany(InventoryTransaction, { foreignKey: "warehouse_id", sourceKey: "warehouse_id" });
InventoryTransaction.belongsTo(Warehouse, { foreignKey: "warehouse_id", targetKey: "warehouse_id" });

Sku.hasMany(InventoryTransaction, { foreignKey: "sku_id", sourceKey: "sku_id" });
InventoryTransaction.belongsTo(Sku, { foreignKey: "sku_id", targetKey: "sku_id" });

InventoryTransaction.belongsTo(Location, {
  as: "fromLocation",
  foreignKey: "from_location_id",
  targetKey: "location_id",
});
InventoryTransaction.belongsTo(Location, {
  as: "toLocation",
  foreignKey: "to_location_id",
  targetKey: "location_id",
});

const models = {
  Tenant,
  User,
  Role,
  Warehouse,
  Supplier,
  Customer,
  Sku,
  WarehouseZone,
  WarehouseAisle,
  WarehouseBay,
  WarehouseLevel,
  WarehouseBin,
  Location,
  InventoryBalance,
  InventoryTransaction,
  LovGroup,
  LovValue,
  Asn,
  AsnLine,
  Grn,
  GrnLine,
  PutawayTask,
  PutawayTaskEvent,
  UserRole,
  UserWarehouse,
  SalesOrder,
  SalesOrderLine,
  PickWave,
  PickTask,
  PackingTask,
  Shipment,
  Return,
  ReturnItem,
};

export {
  sequelize,
  models,
  Tenant,
  User,
  Role,
  Warehouse,
  Supplier,
  Customer,
  Sku,
  WarehouseZone,
  WarehouseAisle,
  WarehouseBay,
  WarehouseLevel,
  WarehouseBin,
  Location,
  InventoryBalance,
  InventoryTransaction,
  LovGroup,
  LovValue,
  Asn,
  AsnLine,
  Grn,
  GrnLine,
  PutawayTask,
  PutawayTaskEvent,
  UserRole,
  UserWarehouse,
  SalesOrder,
  SalesOrderLine,
  PickWave,
  PickTask,
  PackingTask,
  Shipment,
  Return,
  ReturnItem,
};
