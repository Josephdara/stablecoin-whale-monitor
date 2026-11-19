import { loadApiConfig, loadDotEnv } from "../config.mjs";
import { createStorage } from "../storage/index.mjs";
import { createApiApp, EventIndex } from "./app.mjs";

loadDotEnv();
const config = loadApiConfig();
const storage = createStorage(config);
const index = new EventIndex(storage, config.chainId, config.retentionDays);
index.refresh().catch((error) => {
  console.error(JSON.stringify({ level: "error", message: "Initial event index refresh failed", error: error.message }));
});

// Keeps the index warm off the request path, so storage latency no longer
// shows up as request latency. Requests still call ensureFresh as a backstop;
// it returns immediately whenever the timer has already done the work.
index.startBackgroundRefresh(config.refreshMs);

const app = createApiApp({ config, storage, index });
const server = app.listen(config.port, config.host, () => {
  console.error(JSON.stringify({ level: "info", message: "API listening", host: config.host, port: config.port }));
});

function shutdown() {
  index.stopBackgroundRefresh();
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
