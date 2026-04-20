import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import v1Routes from "./routes/v1/index.js";
import { requestContext } from "./middlewares/requestContext.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { createApiRateLimiter } from "./middlewares/rateLimit.js";
import { verifyClerkJwt } from "./middlewares/auth.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: rootEnvPath });

console.log("CLERK_JWKS_URL =", process.env.CLERK_JWKS_URL);

function parseCorsAllowlist() {
  const raw = process.env.CORS_ALLOWLIST || process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

function buildCorsOptions() {
  const allowlist = parseCorsAllowlist();
  return {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin)                    { callback(null, true); return; }
      if (allowlist.includes(origin)) { callback(null, true); return; }
      callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
    },
  };
}

function createApp() {
  const app = express();

  // ── Public endpoints (sebelum JWT middleware) ─────────────────────────────
  app.get("/", (_req, res) => {
    res.json({
      service: "warehouse-backend",
      message: "Warehouse backend stub API is running",
      version:  "v1",
    });
  });

  // Health check — public, untuk Docker / load balancer
  app.get("/api/health", (_req, res) => {
    res.json({
      status:    "ok",
      service:   "warehouse-backend",
      timestamp: new Date().toISOString(),
    });
  });

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use(requestContext);
  app.use(helmet());
  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: "1mb" }));
  app.use(createApiRateLimiter());
  app.use(requestLogger);

  // JWT applies to everything BELOW this line
  app.use(verifyClerkJwt);

  // ── Protected routes ───────────────────────────────────────────────────────
  app.use("/api/v1", v1Routes);

  // ── Error handlers ─────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { createApp };