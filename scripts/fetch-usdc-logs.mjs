#!/usr/bin/env node

import { main } from "../src/indexer/main.mjs";

main().catch((error) => {
  console.error(JSON.stringify({
    level: "error",
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});
