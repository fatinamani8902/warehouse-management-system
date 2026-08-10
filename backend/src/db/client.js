import dotenv from "dotenv";
import { Pool } from "pg";
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

function buildPoolConfig() {
  const baseConfig = {
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 10000),
    ssl: parseBoolean(process.env.PGSSL, false) ? { rejectUnauthorized: false } : undefined,
  };

  if (process.env.DATABASE_URL) {
    return {
      ...baseConfig,
      connectionString: process.env.DATABASE_URL,
    };
  }

  return {
    ...baseConfig,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  };
}

function safePoolSummary(config) {
  if (config.connectionString) {
    try {
      const parsed = new URL(config.connectionString);
      return {
        host: parsed.hostname || "configured",
        port: parsed.port || "default",
        database: parsed.pathname ? parsed.pathname.slice(1) : "configured",
        ssl: Boolean(config.ssl),
      };
    } catch (_error) {
      return { connectionString: "configured", ssl: Boolean(config.ssl) };
    }
  }

  return {
    host: config.host || "localhost",
    port: config.port || 5432,
    database: config.database || "unset",
    user: config.user ? "configured" : "unset",
    ssl: Boolean(config.ssl),
  };
}

const poolConfig = buildPoolConfig();
const pool = new Pool(poolConfig);

pool.on("error", (error) => {
  console.error("PostgreSQL pool error", {
    name: error.name,
    code: error.code,
    message: error.message,
  });
});

if (process.env.NODE_ENV !== "test") {
  console.info("PostgreSQL pool configured", safePoolSummary(poolConfig));
}

export { pool };
