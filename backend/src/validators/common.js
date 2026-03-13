import { z } from "zod";

/* --------------------------
   Route Params
-------------------------- */

const idParamSchema = z.object({
  id: z.string().trim().min(1),
}).strict();

const typeParamSchema = z.object({
  type: z.string().trim().min(1),
}).strict();

/* --------------------------
   Pagination
-------------------------- */

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(500).optional(),
}).strict();

/* --------------------------
   Generic Actions
-------------------------- */

const progressBodySchema = z.object({
  action: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  notes: z.string().trim().max(500).optional(),
}).strict();

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1),
  confirm: z.boolean().optional(),
}).strict();

/* --------------------------
   Generic CRUD
-------------------------- */

const crudCreateBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  status: z.string().trim().min(1).optional(),
}).passthrough();

const crudUpdateBodySchema = crudCreateBodySchema.partial();

/* --------------------------
   Export
-------------------------- */

export {
  z,
  idParamSchema,
  typeParamSchema,
  paginationQuerySchema,
  progressBodySchema,
  cancelBodySchema,
  crudCreateBodySchema,
  crudUpdateBodySchema,
};