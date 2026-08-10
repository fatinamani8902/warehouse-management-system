import dotenv from "dotenv";
import { Sequelize } from "sequelize";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../../.env");

dotenv.config({ path: rootEnvPath });

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function buildSequelizeOptions() {
  return {
    dialect: "postgres",
    logging: parseBoolean(process.env.SEQUELIZE_LOG_SQL, false)
      ? (message) => console.debug(message)
      : false,
    pool: {
      max: Number(process.env.PGPOOL_MAX || 10),
      min: Number(process.env.PGPOOL_MIN || 0),
      idle: Number(process.env.PGPOOL_IDLE_TIMEOUT_MS || 30000),
      acquire: Number(process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 10000),
    },
    dialectOptions: {
      ...(parseBoolean(process.env.PGSSL, false) ? { ssl: { rejectUnauthorized: false } } : {}),
    },
    define: {
      freezeTableName: true,
      underscored: true,
      timestamps: false,
    },
  };
}

function createSequelize() {
  const options = buildSequelizeOptions();

  if (process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, options);
  }

  return new Sequelize(
    process.env.PGDATABASE,
    process.env.PGUSER,
    process.env.PGPASSWORD,
    {
      ...options,
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    }
  );
}

function safeSequelizeSummary() {
  if (process.env.DATABASE_URL) {
    try {
      const parsed = new URL(process.env.DATABASE_URL);
      return {
        host: parsed.hostname || "configured",
        port: parsed.port || "default",
        database: parsed.pathname ? parsed.pathname.slice(1) : "configured",
        ssl: parseBoolean(process.env.PGSSL, false),
      };
    } catch (_error) {
      return { connectionString: "configured", ssl: parseBoolean(process.env.PGSSL, false) };
    }
  }

  return {
    host: process.env.PGHOST || "localhost",
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE || "unset",
    user: process.env.PGUSER ? "configured" : "unset",
    ssl: parseBoolean(process.env.PGSSL, false),
  };
}

const sequelize = createSequelize();

async function authenticateSequelize() {
  await sequelize.authenticate();
  return safeSequelizeSummary();
}

export { sequelize, authenticateSequelize, safeSequelizeSummary };
