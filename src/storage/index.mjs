import { GcsStorageAdapter } from "./gcs.mjs";
import { LocalStorageAdapter } from "./local.mjs";

export function createStorage(config, options = {}) {
  if (config.storageBackend === "local") return new LocalStorageAdapter(config);
  return new GcsStorageAdapter(config, options.gcsClient);
}
