import test from "node:test";
import assert from "node:assert/strict";
import { EthereumRpcClient } from "../src/rpc.mjs";

test("rejects an RPC endpoint on the wrong chain", async () => {
  const response = {
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x5" }),
  };
  const client = new EthereumRpcClient({
    chainId: 1,
    rpcUrl: "https://example.invalid",
    rpcTimeoutMs: 1_000,
    maxRpcResponseBytes: 10_000,
  }, async () => response);
  await assert.rejects(client.assertChainId(), /does not match configured chain ID/);
});

test("splits a logical log range into provider-sized chunks", async () => {
  const requests = [];
  const client = new EthereumRpcClient({
    blockBatchSize: 2_000,
    rpcLogChunkSize: 5,
    tokens: [{ address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" }],
    transferTopic: `0x${"ab".repeat(32)}`,
    rpcUrl: "https://example.invalid",
    rpcTimeoutMs: 1_000,
    maxRpcResponseBytes: 10_000,
  }, async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    return {
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify({ jsonrpc: "2.0", id: request.id, result: [] }),
    };
  });

  assert.deepEqual(await client.getLogs(100, 111), []);
  assert.deepEqual(
    requests.map((request) => request.params[0]).map(({ fromBlock, toBlock }) => [fromBlock, toBlock]),
    [["0x64", "0x68"], ["0x69", "0x6d"], ["0x6e", "0x6f"]],
  );
});
