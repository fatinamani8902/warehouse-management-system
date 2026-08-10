import { authenticateSequelize, sequelize } from "./sequelize.js";
import { models } from "../models/index.js";

async function checkSequelizeHealth() {
  const connection = await authenticateSequelize();
  const modelNames = Object.keys(models).sort();

  return {
    ok: true,
    connection,
    modelNames,
  };
}

async function closeSequelize() {
  await sequelize.close();
}

export { checkSequelizeHealth, closeSequelize };
