import { parseAmount } from "../event.mjs";

const AMOUNT_DECIMALS = 6;

export function selectAlertEvents(events, minimumAmount) {
  const minimum = parseAmount(minimumAmount, AMOUNT_DECIMALS);
  return events.filter((event) => parseAmount(event.amount, AMOUNT_DECIMALS) >= minimum);
}

export function formatAlertEmail(events, minimumAmount) {
  const blocks = events.map((event) => event.blockNumber);
  const range = blocks.length > 1 ? ` (blocks ${Math.min(...blocks)}-${Math.max(...blocks)})` : ` (block ${blocks[0]})`;
  const subject = `Whale alert: ${events.length} transfer${events.length === 1 ? "" : "s"} >= ${minimumAmount}${range}`;
  const details = events.map((event) => [
    `${event.token} ${event.amount} (${event.transferType})`,
    `  from:  ${event.from}`,
    `  to:    ${event.to}`,
    `  block: ${event.blockNumber} at ${event.blockTimestamp}`,
    `  https://etherscan.io/tx/${event.transactionHash}`,
  ].join("\n"));
  return { subject, text: `${details.join("\n\n")}\n` };
}
