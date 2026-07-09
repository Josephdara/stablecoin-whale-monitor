import test from "node:test";
import assert from "node:assert/strict";
import { GcsStorageAdapter } from "../src/storage/gcs.mjs";

test("GCS event 412 is treated as an idempotent duplicate", async () => {
  const file = {
    save: async (_contents, options) => {
      assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
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
  assert.deepEqual(await adapter.createEvent("ethereum/event.json", { ok: true }), { created: false });
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

test("GCS event iteration is paginated and skips known object names", async () => {
  const downloaded = [];
  const file = (name, event) => ({
    name,
    download: async () => {
      downloaded.push(name);
      return [Buffer.from(JSON.stringify(event))];
    },
  });
  const pages = new Map([
    [undefined, [[
      file("ethereum/known.json", { id: "known" }),
      file("ethereum/one.json", { id: "one" }),
      file("ethereum/ignored.txt", { id: "ignored" }),
    ], { pageToken: "next" }]],
    ["next", [[file("ethereum/two.json", { id: "two" })], null]],
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
    { name: "ethereum/one.json", event: { id: "one" } },
    { name: "ethereum/two.json", event: { id: "two" } },
  ]);
  assert.deepEqual(downloaded, ["ethereum/one.json", "ethereum/two.json"]);
});
