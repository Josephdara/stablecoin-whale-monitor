import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function acquireProcessLock(path) {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor;
    try {
      descriptor = openSync(path, "wx", 0o600);
      writeFileSync(descriptor, `${process.pid}\n`, "utf8");
      closeSync(descriptor);
      descriptor = undefined;
      break;
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      if (error?.code !== "EEXIST") throw error;
      if (attempt === 0 && isStale(path)) {
        try { unlinkSync(path); } catch (unlinkError) { if (unlinkError?.code !== "ENOENT") throw unlinkError; }
        continue;
      }
      throw new Error(`Indexer lock already exists: ${path}`);
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { unlinkSync(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  };
}

function isStale(path) {
  let contents;
  try { contents = readFileSync(path, "utf8"); } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  const pid = Number(contents.trim());
  if (!Number.isInteger(pid) || pid < 1) return true;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error?.code === "ESRCH") return true;
    return false;
  }
}
