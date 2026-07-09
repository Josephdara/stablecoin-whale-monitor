import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class LocalStorageAdapter {
  constructor(config) {
    this.root = config.localStorageRoot;
    this.eventsRoot = join(this.root, "events");
    this.stateRoot = join(this.root, "state");
  }

  async createEvent(name, event) {
    const path = join(this.eventsRoot, name);
    await mkdir(dirname(path), { recursive: true });
    let handle;
    try {
      handle = await open(path, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(event)}\n`, "utf8");
      return { created: true };
    } catch (error) {
      if (error?.code === "EEXIST") return { created: false };
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async readCheckpoint() {
    const path = join(this.stateRoot, "ethereum", "checkpoint.json");
    try {
      const contents = await readFile(path, "utf8");
      return { value: JSON.parse(contents), generation: digest(contents) };
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async writeCheckpoint(checkpoint, expectedGeneration) {
    const path = join(this.stateRoot, "ethereum", "checkpoint.json");
    await mkdir(dirname(path), { recursive: true });
    const current = await this.readCheckpoint();
    const currentGeneration = current?.generation ?? "0";
    if (currentGeneration !== expectedGeneration) {
      throw new Error("Checkpoint generation precondition failed");
    }
    const contents = `${JSON.stringify(checkpoint, null, 2)}\n`;
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
    return { generation: digest(contents) };
  }

  async writeTokenMetadata(metadata) {
    const path = join(this.stateRoot, "ethereum", "token-metadata.json");
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  }

  async listEvents() {
    const root = join(this.eventsRoot, "ethereum");
    const paths = await walkJson(root);
    const events = [];
    for (const path of paths) events.push(JSON.parse(await readFile(path, "utf8")));
    return events;
  }
}

async function walkJson(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const paths = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...await walkJson(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) paths.push(path);
  }
  return paths;
}

function digest(contents) {
  return createHash("sha256").update(contents).digest("hex");
}
