import express from "express";
import { requireRole } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { listSchema, createSchema, updateSchema, idSchema } from "../../validators/masterDataValidators.js";
import {
  listFactory,
  getFactory,
  createFactory,
  updateFactory,
  deleteFactory,
} from "../../controllers/masterDataController.js";

const router = express.Router();

function mountCrud(resourcePath, resourceKey) {
  router.get(`/${resourcePath}`, validate(listSchema), listFactory(resourceKey));
  router.get(`/${resourcePath}/:id`, requireRole(["superadmin", "hqadmin", "storemanager"]), validate(idSchema), getFactory(resourceKey));
  router.post(`/${resourcePath}`, validate(createSchema), createFactory(resourceKey));
  router.put(`/${resourcePath}/:id`,
  validate(updateSchema),
  updateFactory(resourceKey)
);

router.delete(`/${resourcePath}/:id`,
  validate(idSchema),
  deleteFactory(resourceKey)
);
}

mountCrud("suppliers", "suppliers");
mountCrud("products", "products");
mountCrud("warehouses", "warehouses");
mountCrud("locations", "locations");

export default router;
