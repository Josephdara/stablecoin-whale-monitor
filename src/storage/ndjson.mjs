export function serializeNdjson(records) {
  return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}

export function parseNdjson(contents) {
  return contents
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}
