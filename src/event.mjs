export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function decodeTransferLog(log, config) {
  const tokenAddress = log?.address?.toLowerCase();
  const token = config.tokens.find((item) => item.address === tokenAddress);
  if (
    !token ||
    log?.topics?.length !== 3 ||
    log.topics[0]?.toLowerCase() !== config.transferTopic ||
    !isBytes32(log.topics[1]) ||
    !isBytes32(log.topics[2]) ||
    !isBytes32(log.data) ||
    !isBytes32(log.transactionHash) ||
    !isBytes32(log.blockHash)
  ) throw new Error("Malformed or unexpected stablecoin Transfer log");

  const rawAmount = BigInt(log.data);
  return {
    token,
    from: topicAddress(log.topics[1]),
    to: topicAddress(log.topics[2]),
    rawAmount,
    amount: formatAmount(rawAmount, token.decimals),
    blockNumber: hexQuantity(log.blockNumber),
    blockHash: log.blockHash.toLowerCase(),
    logIndex: hexQuantity(log.logIndex),
    transactionHash: log.transactionHash.toLowerCase(),
  };
}

export function buildEvent(transfer, block, config, detectedAt = new Date().toISOString()) {
  return {
    chain: config.chain,
    chainId: config.chainId,
    token: transfer.token.symbol,
    tokenContract: transfer.token.address,
    transactionHash: transfer.transactionHash,
    blockNumber: transfer.blockNumber,
    blockTimestamp: block.timestamp,
    logIndex: transfer.logIndex,
    from: transfer.from,
    to: transfer.to,
    rawAmount: transfer.rawAmount.toString(),
    amount: transfer.amount,
    threshold: config.minimumAmount,
    transactionStatus: "success",
    transferType: classifyTransfer(transfer.from, transfer.to),
    detectedAt,
  };
}

export function rangeObjectName(fromBlock, toBlock) {
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlock) || fromBlock > toBlock) {
    throw new Error(`Invalid block range: ${fromBlock}-${toBlock}`);
  }
  const pad = (block) => String(block).padStart(12, "0");
  return `ethereum/ranges/${pad(fromBlock)}-${pad(toBlock)}.json`;
}

export function eventKey(event) {
  return `${event.chainId}:${event.transactionHash.toLowerCase()}:${event.logIndex}`;
}

export function classifyTransfer(from, to) {
  if (from.toLowerCase() === ZERO_ADDRESS) return "mint";
  if (to.toLowerCase() === ZERO_ADDRESS) return "burn";
  return "normal";
}

export function parseAmount(value, decimals) {
  const pattern = decimals === 0 ? /^[0-9]+$/ : new RegExp(`^[0-9]+(?:\\.[0-9]{1,${decimals}})?$`);
  if (!pattern.test(value)) throw new Error(`Amount must have at most ${decimals} decimal places`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
}

export function formatAmount(rawAmount, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = rawAmount / base;
  const fraction = (rawAmount % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function topicAddress(value) {
  return `0x${value.slice(-40).toLowerCase()}`;
}

function hexQuantity(value) {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`Invalid RPC quantity: ${value}`);
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("RPC quantity exceeds safe integer range");
  return Number(parsed);
}

function isBytes32(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
