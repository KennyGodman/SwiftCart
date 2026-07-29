import crypto from "crypto";
import { createOrder } from "./orders.js";
import { CATALOGUE } from "../src/catalogue.js";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const MERCHANT_ADDR = process.env.MERCHANT_ADDRESS || "0xd515765a6c9b1c3f9a4df52f5326eea43ee42469";
const ARC_RPC = "https://rpc.testnet.arc.network";

function parseTransferTx(inputData) {
  // Selector for transfer(address,uint256) is 0xa9059cbb
  if (!inputData || !inputData.startsWith("0xa9059cbb")) return null;
  const recipient = "0x" + inputData.slice(34, 74).toLowerCase();
  const amountRaw = BigInt("0x" + inputData.slice(74, 138));
  return { recipient, amountRaw };
}

async function verifyOnChainPayment(txHash, expectedAmount, expectedRecipient) {
  try {
    // 1. Fetch transaction details
    const txRes = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionByHash",
        params: [txHash]
      })
    });
    const txJson = await txRes.json();
    if (txJson.error || !txJson.result) {
      return { valid: false, reason: "Transaction not found on-chain." };
    }

    const tx = txJson.result;
    
    // Check if recipient contract is the USDC token
    if (!tx.to || tx.to.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
      return { valid: false, reason: "Recipient contract is not the USDC token." };
    }

    // Parse the input data for transfer(address,uint256)
    const transfer = parseTransferTx(tx.input);
    if (!transfer) {
      return { valid: false, reason: "Not a standard ERC-20 transfer transaction." };
    }

    if (transfer.recipient !== expectedRecipient.toLowerCase()) {
      return { valid: false, reason: `Recipient mismatch. Expected ${expectedRecipient}, got ${transfer.recipient}` };
    }

    // Convert expectedAmount to raw units (6 decimals)
    const expectedRaw = BigInt(Math.round(expectedAmount * 1e6));
    if (transfer.amountRaw < expectedRaw) {
      return { valid: false, reason: `Insufficient payment amount. Expected at least ${expectedRaw} raw units, got ${transfer.amountRaw}` };
    }

    // 2. Fetch transaction receipt to check execution status
    const rcptRes = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getTransactionReceipt",
        params: [txHash]
      })
    });
    const rcptJson = await rcptRes.json();
    if (rcptJson.error || !rcptJson.result) {
      return { valid: false, reason: "Transaction receipt not available yet." };
    }

    const receipt = rcptJson.result;
    if (receipt.status !== "0x1") {
      return { valid: false, reason: "On-chain transaction execution failed." };
    }

    return { valid: true, from: tx.from };
  } catch (err) {
    return { valid: false, reason: "Verification failed: " + err.message };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-USDC-Payment-Tx");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    items, userWallet: reqUserWallet, customerEmail, fulfillmentMethod = "delivery",
    deliveryFullName, deliveryPhone, deliveryAddressLine, deliveryCity, deliveryState, deliveryNotes
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing or invalid items array." });
  }

  // Look up items in catalogue to calculate correct cost
  let totalItemsPrice = 0;
  const catalogMap = new Map();
  
  // Flatten catalogue
  Object.values(CATALOGUE).forEach(sec => {
    if (sec.categories) {
      Object.values(sec.categories).forEach(cat => {
        if (cat.items) {
          cat.items.forEach(item => {
            catalogMap.set(item.id, item);
          });
        }
      });
    }
  });

  const verifiedItems = [];
  for (const item of items) {
    const catalogItem = catalogMap.get(item.id);
    if (!catalogItem) {
      return res.status(400).json({ error: `Product ID ${item.id} not found in catalogue.` });
    }
    const qty = Number(item.qty || 1);
    totalItemsPrice += catalogItem.price * qty;
    verifiedItems.push({
      id: catalogItem.id,
      name: catalogItem.name,
      price: catalogItem.price,
      qty,
      img: catalogItem.img,
      size: item.size || "Default",
      color: item.color || "Default"
    });
  }

  // Delivery fee calculation
  const getDeliveryFee = (st) => {
    const s = (st || "").toLowerCase().trim();
    if (s === "lagos") return 5.0;
    if (s === "abuja") return 8.0;
    if (s === "rivers") return 10.0;
    return 6.0;
  };
  
  const deliveryFee = (fulfillmentMethod === "delivery") ? getDeliveryFee(deliveryState) : 0;
  const totalCost = totalItemsPrice + deliveryFee;

  // Check for X-USDC-Payment-Tx header (or from body)
  const txHash = req.headers["x-usdc-payment-tx"] || req.headers["X-USDC-Payment-Tx"] || req.body.txHash;
  const orderId = req.body.orderId || crypto.randomUUID();

  if (!txHash) {
    // Return 402 Payment Required for x402 Protocol compliance
    res.setHeader("X-USDC-Payment-Address", MERCHANT_ADDR);
    res.setHeader("X-USDC-Amount", totalCost.toFixed(2));
    res.setHeader("X-USDC-Chain-Id", "511");
    res.setHeader("X-USDC-Memo", orderId);
    
    return res.status(402).json({
      error: "Payment Required",
      message: "x402 protocol payment required. Please transfer the specified USDC amount on Arc Testnet, then re-submit this request with the transaction hash in the X-USDC-Payment-Tx header.",
      paymentRequired: {
        address: MERCHANT_ADDR,
        amount: totalCost,
        token: "USDC (0x3600000000000000000000000000000000000000)",
        chainId: 511,
        memo: orderId,
        fulfillmentMethod,
        deliveryFee
      }
    });
  }

  // If txHash is provided, verify it on-chain
  console.log(`[agent-checkout] Verifying on-chain payment tx: ${txHash}...`);
  const verification = await verifyOnChainPayment(txHash, totalCost, MERCHANT_ADDR);

  if (!verification.valid) {
    return res.status(400).json({
      error: "INVALID_PAYMENT",
      message: `On-chain verification of transaction hash failed: ${verification.reason}`
    });
  }

  // Create the order in DB
  const buyerWallet = reqUserWallet || verification.from || "0x0000000000000000000000000000000000000000";
  try {
    const order = await createOrder({
      userWallet: buyerWallet,
      items: verifiedItems,
      total: totalCost,
      txHash,
      customerEmail,
      status: "success",
      fulfillmentMethod,
      deliveryFee,
      deliveryFullName,
      deliveryPhone,
      deliveryAddressLine,
      deliveryCity,
      deliveryState,
      deliveryNotes
    });

    return res.status(201).json({
      success: true,
      message: "Payment verified successfully and order created.",
      order
    });
  } catch (err) {
    console.error("[agent-checkout] Save order error:", err.message);
    return res.status(500).json({ error: "Failed to store order in database: " + err.message });
  }
}
