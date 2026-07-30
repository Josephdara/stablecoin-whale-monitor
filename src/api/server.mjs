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

const app = createApiApp({ config, storage, index });
const server = app.listen(config.port, config.host, () => {
  console.error(JSON.stringify({ level: "info", message: "API listening", host: config.host, port: config.port }));
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
