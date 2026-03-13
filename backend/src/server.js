import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import outboundRoutes from "./routes/v1/outboundRoutes.js";
import inventoryRoutes from "./routes/v1/inventoryRoutes.js";

const __filename = fileURLToPath(import.meta.url);

function startServer(port = Number(process.env.PORT || 5000)) {

  const app = createApp();

  /* REGISTER OUTBOUND ROUTES */
  app.use("/api/v1/outbound", outboundRoutes);
  app.use("/api/v1/inventory", inventoryRoutes);

  return app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
  });

}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  startServer();
}

export { createApp, startServer };