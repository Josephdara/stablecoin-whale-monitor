import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";
import { parseNdjson, serializeNdjson } from "./ndjson.mjs";

export class GcsStorageAdapter {
  constructor(config, storage = new Storage()) {
    this.eventsBucket = storage.bucket(config.gcsEventsBucket);
    this.stateBucket = storage.bucket(config.gcsStateBucket);
  }

  async createEventBatch(name, events) {
    try {
      await this.eventsBucket.file(name).save(serializeNdjson(events), {
        contentType: "application/x-ndjson",
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      return { created: true };
    } catch (error) {
      if (Number(error?.code) === 412) return { created: false };
      throw error;
    }
  }

  async readCheckpoint() {
    const name = "ethereum/checkpoint.json";
    const file = this.stateBucket.file(name);
    let metadata;
    try {
      [metadata] = await file.getMetadata();
    } catch (error) {
      if (Number(error?.code) === 404) return null;
      throw error;
    }
    const generation = String(metadata.generation);
    const [contents] = await this.stateBucket.file(name, { generation }).download();
    return { value: JSON.parse(contents.toString("utf8")), generation };
  }

  async writeCheckpoint(checkpoint, expectedGeneration) {
    const file = this.stateBucket.file("ethereum/checkpoint.json");
    const writeId = randomUUID();
    await file.save(`${JSON.stringify(checkpoint, null, 2)}\n`, {
      contentType: "application/json",
      resumable: false,
      preconditionOpts: { ifGenerationMatch: expectedGeneration === "0" ? 0 : expectedGeneration },
      metadata: { metadata: { swmWriteId: writeId } },
    });
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.swmWriteId !== writeId) {
      throw new Error("Checkpoint changed concurrently after write");
    }
    return { generation: String(metadata.generation) };
  }

  async writeTokenMetadata(metadata) {
    const file = this.stateBucket.file("ethereum/token-metadata.json");
    let generation = 0;
    try {
      const [current] = await file.getMetadata();
      generation = String(current.generation);
    } catch (error) {
      if (Number(error?.code) !== 404) throw error;
    }
    await file.save(`${JSON.stringify(metadata, null, 2)}\n`, {
      contentType: "application/json",
      resumable: false,
      preconditionOpts: { ifGenerationMatch: generation },
    });
  }

  async *iterateEvents({ knownNames = new Set(), startOffset } = {}) {
    let pageToken;
    do {
      const [files, nextQuery] = await this.eventsBucket.getFiles({
        prefix: "ethereum/",
        autoPaginate: false,
        maxResults: 1_000,
        ...(startOffset ? { startOffset } : {}),
        ...(pageToken ? { pageToken } : {}),
      });
      const wanted = files.filter(
        (file) => file.name.endsWith(".json") && !knownNames.has(file.name),
      );
      for (let i = 0; i < wanted.length; i += 25) {
        const batch = await Promise.all(
          wanted.slice(i, i + 25).map(async (file) => {
            const [contents] = await file.download();
            return { name: file.name, events: parseNdjson(contents.toString("utf8")) };
          }),
        );
        for (const { name, events } of batch) {
          for (const event of events) yield { name, event };
        }
      }
      pageToken = nextQuery?.pageToken;
    } while (pageToken);
  }

  async listEvents() {
    const events = [];
    for await (const { event } of this.iterateEvents()) events.push(event);
    return events;
  }
}
