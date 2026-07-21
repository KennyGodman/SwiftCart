export const fmt = (n) => `${Number(n).toFixed(2)} USDC`;
export const trunc = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
export const disc = (p, op) => Math.round(((op - p) / op) * 100);

// Helper to pad hex values to 32-byte (64 characters) words
const pad32 = (str, direction = "right") => {
  const clean = str.replace("0x", "").toLowerCase();
  return direction === "left" ? clean.padStart(64, "0") : clean.padEnd(64, "0");
};

/**
 * Encodes a USDC transfer wrapped in the Arc Memo contract call.
 * Function signature: memo(address target, bytes data, bytes32 memoId, bytes memoData)
 *
 * NOTE: The memoId here is the UUID stripped of hyphens (raw bytes), which is
 * the Arc on-chain memo format. This is intentionally different from the
 * MerchantVault orderId key (which uses keccak256). See orderIdToBytes32 below.
 */
export const encodeMemoUSDC = (recipient, amountUSDC, orderId) => {
  const selector = "c3b2c4f8"; // memo(address,bytes,bytes32,bytes)
  const targetEncoded = pad32("0x3600000000000000000000000000000000000000", "left"); // USDC address
  const dataOffset = pad32("80", "left"); // offset to dynamic USDC data payload

  // Strip hyphens from UUID to make a clean bytes32 memoId
  const cleanUuid = orderId.replace(/-/g, "");
  const memoIdEncoded = pad32(cleanUuid, "right");
  const memoDataOffset = pad32("100", "left"); // offset to dynamic memo payload

  // Inner USDC transfer encoding
  const rawAmt = Math.round(amountUSDC * 1e6);
  const transferSelector = "a9059cbb"; // transfer(address,uint256)
  const innerData = transferSelector + pad32(recipient, "left") + pad32(rawAmt.toString(16), "left");

  // Data payload header (length = 68 bytes / 0x44) + padded payload (96 bytes)
  const dataPayload = pad32("44", "left") + innerData.padEnd(192, "0");

  // Memo text payload ("SwiftCart Order") -> Length = 15 (0x0f)
  const memoText = "SwiftCart Order";
  let memoHex = "";
  for (let i = 0; i < memoText.length; i++) {
    memoHex += memoText.charCodeAt(i).toString(16);
  }
  const memoPayload = pad32((memoText.length).toString(16), "left") + memoHex.padEnd(64, "0");

  return "0x" + selector + targetEncoded + dataOffset + memoIdEncoded + memoDataOffset + dataPayload + memoPayload;
};

// ── MerchantVault v3 orderId helpers ─────────────────────────────────────────
//
// MerchantVault v3 changed orderId storage from string → bytes32:
//
//   mapping(bytes32 => Order) public orders;
//
// All external functions now accept:
//   bytes32 orderId  // = keccak256(abi.encodePacked(rawStringOrderId))
//
// Callers must hash the raw UUID string before calling pay(), confirmShipped(),
// confirmDelivery(), disputeOrder(), releaseAfterWindow(), settleOrder(),
// refundOrder(), or getOrder().
//
// The helpers below produce that hash in JavaScript.

/**
 * Converts a raw UUID orderId string to the bytes32 key MerchantVault v3 expects:
 *   keccak256(abi.encodePacked(rawOrderId))
 *
 * This function is asynchronous and zero-dependency. It resolves via:
 *   1. window.__ethers_keccak256 (if ethers is globally available in the app)
 *   2. A POST /api/utils/keccak backend endpoint (easy to add, see below)
 *
 * For components that already import ethers, use orderIdToBytes32Sync() instead.
 *
 * @param {string} rawOrderId  UUID string, e.g. "550e8400-e29b-41d4-a716-446655440000"
 * @returns {Promise<string>}  0x-prefixed 32-byte hex matching Solidity bytes32
 */
export async function orderIdToBytes32(rawOrderId) {
  // Option A — ethers injected globally by App.jsx or a provider component:
  //   window.__ethers_keccak256 = (id) => ethers.keccak256(ethers.toUtf8Bytes(id));
  if (typeof window !== "undefined" && typeof window.__ethers_keccak256 === "function") {
    return window.__ethers_keccak256(rawOrderId);
  }

  // Option B — thin backend endpoint (Node crypto supports keccak via ethers/viem):
  //   POST /api/utils/keccak { value: rawOrderId } → { hash: "0x..." }
  //   Example handler (api/utils/keccak.js):
  //     import { createHash } from "crypto";
  //     // Node 22+ has keccak256 natively via `crypto.hash("sha3-256", ...)` — but
  //     // note sha3-256 ≠ keccak256. Use the `ethereum-cryptography` package or ethers:
  //     import { keccak256 } from "ethers";
  //     export default (req, res) => res.json({ hash: keccak256(Buffer.from(req.body.value)) });
  try {
    const res = await fetch("/api/utils/keccak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: rawOrderId }),
    });
    if (res.ok) {
      const { hash } = await res.json();
      return hash; // "0x..."
    }
  } catch {
    // fall-through to error below
  }

  throw new Error(
    "[orderIdToBytes32] No keccak256 implementation found.\n" +
    "Fix: add `window.__ethers_keccak256 = (id) => ethers.keccak256(ethers.toUtf8Bytes(id));`\n" +
    "in App.jsx, or deploy a POST /api/utils/keccak endpoint."
  );
}

/**
 * Synchronous version — use when ethers is already imported in the calling module.
 *
 * Example:
 *   import { keccak256, toUtf8Bytes } from "ethers";
 *   import { orderIdToBytes32Sync } from "./utils";
 *
 *   // Before calling pay() on MerchantVault:
 *   const key = orderIdToBytes32Sync(rawOrderId, keccak256, toUtf8Bytes);
 *   await vaultContract.pay(amount, key, productName);
 *
 * @param {string}   rawOrderId     Plain UUID / order ID string
 * @param {Function} keccak256fn    ethers.keccak256
 * @param {Function} toUtf8BytesFn  ethers.toUtf8Bytes
 * @returns {string}  0x-prefixed bytes32 hex
 */
export function orderIdToBytes32Sync(rawOrderId, keccak256fn, toUtf8BytesFn) {
  return keccak256fn(toUtf8BytesFn(rawOrderId));
}
