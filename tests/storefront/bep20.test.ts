import { describe, it, expect, vi } from "vitest";
import { BSC_USDT, TRANSFER_TOPIC, receivedUsdtCents, verifyBep20Transfer } from "@server/payments/bep20";
const hash = `0x${"a".repeat(64)}`;
const destination = `0x${"b".repeat(40)}`;
const receipt = (amount = 1234567890000000000n) => ({ transactionHash: hash, status: "0x1", blockNumber: "0x64", blockHash: hash, logs: [{ address: BSC_USDT, topics: [TRANSFER_TOPIC, `0x${"0".repeat(64)}`, `0x${destination.slice(2).padStart(64,"0")}`], data: `0x${amount.toString(16).padStart(64,"0")}` }] });
describe("BEP20 transfer verification", () => {
 it("rounds received tokens down to cents", () => expect(receivedUsdtCents(receipt(), destination, hash)).toBe(123n));
 it("does not credit another token, recipient, removed event or failed receipt", () => {
  const wrongToken=receipt();wrongToken.logs[0].address=destination;
  expect(receivedUsdtCents(wrongToken,destination,hash)).toBe(0n);
  expect(receivedUsdtCents(receipt(),`0x${"c".repeat(40)}`,hash)).toBe(0n);
  expect(()=>receivedUsdtCents({...receipt(),status:"0x0"},destination,hash)).toThrow();
  expect(()=>receivedUsdtCents(receipt(),destination,`0x${"c".repeat(64)}`)).toThrow();
 });
 function mockRpc(changes: Record<string,unknown> = {}) {
  const values: Record<string,unknown> = { eth_chainId:"0x38",eth_getTransactionReceipt:receipt(),eth_blockNumber:"0x90",eth_getBlockByNumber:{hash,timestamp:`0x${Math.floor(Date.now()/1000).toString(16)}`},...changes };
  return vi.fn(async (_url:unknown,init:RequestInit) => new Response(JSON.stringify({result:values[JSON.parse(String(init.body)).method]}))) as unknown as typeof fetch;
 }
 it("checks finality and the canonical block", async () => {
  const input={txHash:hash,destination,createdAt:new Date().toISOString()};
  await expect(verifyBep20Transfer(input,mockRpc())).resolves.toMatchObject({received_amount:1.23,chain_id:56});
  await expect(verifyBep20Transfer(input,mockRpc({eth_chainId:"0x1"}))).rejects.toThrow();
  await expect(verifyBep20Transfer(input,mockRpc({eth_blockNumber:"0x65"}))).rejects.toThrow();
  await expect(verifyBep20Transfer(input,mockRpc({eth_getBlockByNumber:{hash:`0x${"d".repeat(64)}`,timestamp:"0x1"}}))).rejects.toThrow();
  await expect(verifyBep20Transfer(input,mockRpc({eth_getTransactionReceipt:null}))).rejects.toThrow();
 });
});
