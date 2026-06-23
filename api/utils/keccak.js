/**
 * api/utils/keccak.js
 *
 * Tiny serverless endpoint that computes keccak256(utf8Bytes(value)).
 *
 * Used by src/utils.js → orderIdToBytes32() when ethers.js is not available
 * in the browser context. Returns the same hash that Solidity produces for:
 *
 *   keccak256(abi.encodePacked(rawOrderId))
 *
 * which is what MerchantVault v3 expects as its bytes32 orderId key.
 *
 * Method: POST
 * Body:   { "value": "your-uuid-string" }
 * Returns { "hash": "0x..." }
 */

import { keccak256, toUtf8Bytes } from "ethers";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { value } = req.body ?? {};
  if (typeof value !== "string" || value.length === 0) {
    return res.status(400).json({ error: "Required: { value: string }" });
  }

  try {
    const hash = keccak256(toUtf8Bytes(value));
    return res.status(200).json({ hash });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
