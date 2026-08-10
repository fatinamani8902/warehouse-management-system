import assert from "node:assert/strict";
import test, { after } from "node:test";
import { checkSequelizeHealth, closeSequelize } from "../src/db/sequelizeHealth.js";
import {
  Asn,
  AsnLine,
  Customer,
  Grn,
  GrnLine,
  InventoryBalance,
  InventoryTransaction,
  Location,
  LovGroup,
  LovValue,
  PutawayTask,
  PutawayTaskEvent,
  Role,
  Sku,
  Supplier,
  Tenant,
  User,
  UserRole,
  UserWarehouse,
  Warehouse,
  WarehouseAisle,
  WarehouseBay,
  WarehouseBin,
  WarehouseLevel,
  WarehouseZone,
} from "../src/models/index.js";

after(async () => {
  await closeSequelize();
});

test("Sequelize authenticates and registers initial PostgreSQL models", async () => {
  const health = await checkSequelizeHealth();

  assert.equal(health.ok, true);
  assert.deepEqual(health.modelNames, [
    "Asn",
    "AsnLine",
    "Customer",
    "Grn",
    "GrnLine",
    "InventoryBalance",
    "InventoryTransaction",
    "Location",
      "LovGroup",
      "LovValue",
      "PackingTask",
      "PickTask",
      "PickWave",
      "PutawayTask",
      "PutawayTaskEvent",
      "Role",
      "SalesOrder",
      "SalesOrderLine",
      "Shipment",
      "Sku",
    "Supplier",
    "Tenant",
    "User",
    "UserRole",
    "UserWarehouse",
    "Warehouse",
    "WarehouseAisle",
    "WarehouseBay",
    "WarehouseBin",
    "WarehouseLevel",
    "WarehouseZone",
  ]);
  assert.equal(Tenant.tableName, "tenants");
  assert.equal(User.tableName, "users");
  assert.equal(Role.tableName, "roles");
  assert.equal(Warehouse.tableName, "warehouses");
  assert.equal(Sku.tableName, "skus");
  assert.equal(Supplier.tableName, "suppliers");
  assert.equal(Customer.tableName, "customers");
  assert.equal(LovGroup.tableName, "lov_groups");
  assert.equal(LovValue.tableName, "lov_values");
  assert.equal(WarehouseZone.tableName, "warehouse_zones");
  assert.equal(WarehouseAisle.tableName, "warehouse_aisles");
  assert.equal(WarehouseBay.tableName, "warehouse_bays");
  assert.equal(WarehouseLevel.tableName, "warehouse_levels");
  assert.equal(WarehouseBin.tableName, "warehouse_bins");
  assert.equal(Location.tableName, "locations");
  assert.equal(InventoryBalance.tableName, "inventory_balances");
  assert.equal(InventoryTransaction.tableName, "inventory_transactions");
  assert.equal(Asn.tableName, "asns");
  assert.equal(AsnLine.tableName, "asn_lines");
  assert.equal(Grn.tableName, "grns");
  assert.equal(GrnLine.tableName, "grn_lines");
  assert.equal(PutawayTask.tableName, "putaway_tasks");
  assert.equal(PutawayTaskEvent.tableName, "putaway_task_events");
  assert.equal(UserRole.tableName, "user_roles");
  assert.equal(UserWarehouse.tableName, "user_warehouses");

  const tenantCount = await Tenant.count();
  assert.equal(Number.isInteger(tenantCount), true);
});
