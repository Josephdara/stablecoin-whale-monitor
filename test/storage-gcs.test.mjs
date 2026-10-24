import test from "node:test";
import assert from "node:assert/strict";
import { GcsStorageAdapter } from "../src/storage/gcs.mjs";

test("GCS batch 412 is treated as an idempotent duplicate", async () => {
  const saved = [];
  const file = {
    save: async (contents, options) => {
      assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
      saved.push(contents);
      const error = new Error("precondition failed");
      error.code = 412;
      throw error;
    },
  };
  const bucket = { file: () => file };
  const storageClient = { bucket: () => bucket };
  const adapter = new GcsStorageAdapter(
    { gcsEventsBucket: "events", gcsStateBucket: "state" },
    storageClient,
  );
  assert.deepEqual(
    await adapter.createEventBatch("ethereum/ranges/000000000100-000000000199.json", [{ id: 1 }, { id: 2 }]),
    { created: false },
  );
  assert.deepEqual(saved, ['{"id":1}\n{"id":2}\n']);
});

test("GCS checkpoint reads are pinned and replacements return their own generation", async () => {
  let savedOptions;
  const checkpoint = { lastProcessedBlock: 100 };
  const baseFile = {
    save: async (_contents, options) => { savedOptions = options; },
    getMetadata: async () => [{
      generation: "8",
      metadata: { swmWriteId: savedOptions?.metadata.metadata.swmWriteId },
    }],
  };
  const pinnedFile = {
    download: async () => [Buffer.from(JSON.stringify(checkpoint))],
  };
  const stateBucket = {
    file: (_name, options) => options?.generation ? pinnedFile : baseFile,
  };
  const storageClient = {
    bucket: (name) => name === "state" ? stateBucket : { file: () => ({}) },
  };
  const adapter = new GcsStorageAdapter(
    { gcsEventsBucket: "events", gcsStateBucket: "state" },
    storageClient,
  );

  const read = await adapter.readCheckpoint();
  assert.deepEqual(read, { value: checkpoint, generation: "8" });
  const written = await adapter.writeCheckpoint(checkpoint, "8");
  assert.equal(savedOptions.preconditionOpts.ifGenerationMatch, "8");
  assert.ok(savedOptions.metadata.metadata.swmWriteId);
  assert.deepEqual(written, { generation: "8" });
});

test("GCS checkpoint read retries when the pinned generation is replaced mid-read", async () => {
  let generation = 8;
  const checkpoint = { lastProcessedBlock: 101 };
  const stateBucket = {
    file: (_name, options) => options?.generation
      ? {
        download: async () => {
          if (options.generation === "8") {
            generation = 9;
            const error = new Error("No such object");
            error.code = 404;
            throw error;
          }
          return [Buffer.from(JSON.stringify(checkpoint))];
        },
      }
      : { getMetadata: async () => [{ generation }] },
  };
  const storageClient = {
    bucket: (name) => name === "state" ? stateBucket : { file: () => ({}) },
  };
  const adapter = new GcsStorageAdapter(
    { gcsEventsBucket: "events", gcsStateBucket: "state" },
    storageClient,
  );

  assert.deepEqual(await adapter.readCheckpoint(), { value: checkpoint, generation: "9" });
});

test("GCS event iteration is paginated, skips known names, and reads both single-event and NDJSON batch objects", async () => {
  const downloaded = [];
  const file = (name, contents) => ({
    name,
    download: async () => {
      downloaded.push(name);
      return [Buffer.from(contents)];
    },
  });
  const pages = new Map([
    [undefined, [[
      file("ethereum/known.json", '{"id":"known"}\n'),
      file("ethereum/2026/06/30/legacy.json", '{"id":"one"}\n'),
      file("ethereum/ignored.txt", "ignored"),
    ], { pageToken: "next" }]],
    ["next", [[
      file("ethereum/ranges/000000000100-000000000199.json", '{"id":"two"}\n{"id":"three"}\n'),
    ], null]],
  ]);
  const eventsBucket = {
    getFiles: async (query) => {
      assert.equal(query.autoPaginate, false);
      assert.equal(query.maxResults, 1_000);
      assert.equal(query.prefix, "ethereum/");
      return pages.get(query.pageToken);
    },
  };
  const storageClient = {
    bucket: (name) => name === "events" ? eventsBucket : {},
  };
  const adapter = new GcsStorageAdapter(
    { gcsEventsBucket: "events", gcsStateBucket: "state" },
    storageClient,
  );
  const entries = [];
  for await (const entry of adapter.iterateEvents({
    knownNames: new Set(["ethereum/known.json"]),
  })) entries.push(entry);

  assert.deepEqual(entries, [
    { name: "ethereum/2026/06/30/legacy.json", event: { id: "one" } },
    { name: "ethereum/ranges/000000000100-000000000199.json", event: { id: "two" } },
    { name: "ethereum/ranges/000000000100-000000000199.json", event: { id: "three" } },
  ]);
  assert.deepEqual(downloaded, [
    "ethereum/2026/06/30/legacy.json",
    "ethereum/ranges/000000000100-000000000199.json",
  ]);
});

test("GCS event iteration forwards the lexicographic start offset", async () => {
  const queries = [];
  const eventsBucket = {
    getFiles: async (query) => {
      queries.push(query);
      return [[], null];
    },
  };
  const storageClient = {
    bucket: (name) => name === "events" ? eventsBucket : {},
  };
  const adapter = new GcsStorageAdapter(
    { gcsEventsBucket: "events", gcsStateBucket: "state" },
    storageClient,
  );
  const startOffset = "ethereum/ranges/000000000100-000000000199.json";

  for await (const _entry of adapter.iterateEvents({ startOffset })) {
    assert.fail("empty listing should not yield an event");
  }

  assert.equal(queries.length, 1);
  assert.equal(queries[0].startOffset, startOffset);
});
