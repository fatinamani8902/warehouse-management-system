import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function startServer(port = Number(process.env.PORT || 5000)) {
  // createApp() already mounts ALL routes under /api/v1 via v1Routes.
  // DO NOT register any routes here — doing so creates duplicate handlers.
  const app = createApp();

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
