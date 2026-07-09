import { loadDotEnv, loadIndexerConfig } from "../config.mjs";
import { acquireProcessLock } from "../lock.mjs";
import { EthereumRpcClient } from "../rpc.mjs";
import { createStorage } from "../storage/index.mjs";
import { runIndexer } from "./indexer.mjs";

export async function main(argv = process.argv.slice(2)) {
  loadDotEnv();
  const unknown = argv.filter((argument) => argument !== "--once");
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(" ")}. Supported: --once`);
  const config = loadIndexerConfig();
  const releaseLock = acquireProcessLock(config.lockFile);
  const shutdown = () => {
    releaseLock();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    const rpc = new EthereumRpcClient(config);
    const storage = createStorage(config);
    await runIndexer({ config, rpc, storage, once: argv.includes("--once") });
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    releaseLock();
  }
}
