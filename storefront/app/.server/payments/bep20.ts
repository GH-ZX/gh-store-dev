/** Fixed network and token allowlist. Never use a customer-supplied RPC endpoint. */
export const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const RPC = "https://bsc-dataseed-public.bnbchain.org";
const HASH = /^0x[0-9a-f]{64}$/i;
const HEX = /^0x[0-9a-f]+$/i;
type Log = { address: string; topics: string[]; data: string; removed?: boolean };
type Receipt = { status: string; transactionHash: string; blockNumber: string; blockHash: string; logs: Log[] };
export function receivedUsdtCents(receipt: Receipt, destination: string, txHash: string): bigint {
  if (!HASH.test(txHash) || !/^0x[0-9a-f]{40}$/i.test(destination) || receipt.status !== "0x1" || receipt.transactionHash.toLowerCase() !== txHash.toLowerCase()) throw new Error("Transfer is not successful");
  let units = 0n;
  const toTopic = `0x${destination.slice(2).toLowerCase().padStart(64, "0")}`;
  for (const log of receipt.logs) {
    if (!log.removed && log.address.toLowerCase() === BSC_USDT && log.topics.length === 3 && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics[2]?.toLowerCase() === toTopic && HASH.test(log.data)) units += BigInt(log.data);
  }
  // This token has 18 decimals. Round DOWN to wallet cents, never credit dust.
  return units / 10n ** 16n;
}
export async function verifyBep20Transfer(input: { txHash: string; destination: string; createdAt: string }, fetcher: typeof fetch = fetch) {
  if (!HASH.test(input.txHash)) throw new Error("A valid BEP20 transaction hash is required");
  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetcher(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Network verification unavailable; retry later");
    const body = await response.json() as { result?: T; error?: unknown };
    if (body.error || body.result == null) throw new Error("Transfer not confirmed yet; retry later");
    return body.result;
  }
  const [chain, receipt, latest] = await Promise.all([rpc<string>("eth_chainId", []), rpc<Receipt>("eth_getTransactionReceipt", [input.txHash]), rpc<string>("eth_blockNumber", [])]);
  if (chain !== "0x38" || !HEX.test(latest) || !HEX.test(receipt.blockNumber) || BigInt(latest) - BigInt(receipt.blockNumber) + 1n < 20n) throw new Error("Waiting for 20 network confirmations");
  const block = await rpc<{ hash: string; timestamp: string }>("eth_getBlockByNumber", [receipt.blockNumber, false]);
  if (block.hash.toLowerCase() !== receipt.blockHash.toLowerCase() || !HEX.test(block.timestamp)) throw new Error("Transfer block is not canonical");
  const timestamp = Number(BigInt(block.timestamp)) * 1000;
  // Allow sending just before opening a claim, but reject old public transfers.
  if (timestamp < Date.parse(input.createdAt) - 3600000 || timestamp > Date.now() + 60000) throw new Error("Transfer date does not match this recharge; contact support");
  const cents = receivedUsdtCents(receipt, input.destination, input.txHash);
  if (cents <= 0n || cents > 10000000n) throw new Error("No supported USDT amount reached the store address");
  return { received_amount: Number(cents) / 100, network: "BEP20", chain_id: 56, token: BSC_USDT, destination: input.destination, tx_hash: input.txHash.toLowerCase(), block_hash: receipt.blockHash, block_number: receipt.blockNumber, confirmations: Number(BigInt(latest) - BigInt(receipt.blockNumber) + 1n) };
}
