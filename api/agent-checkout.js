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

const MEMO_ADDRESS = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";

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
    if (!tx.to) {
      return { valid: false, reason: "Invalid transaction: no recipient address." };
    }

    let transfer = null;

    if (tx.to.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
      // Direct USDC transfer
      transfer = parseTransferTx(tx.input);
    } else if (tx.to.toLowerCase() === MEMO_ADDRESS.toLowerCase()) {
      // Memo-wrapped USDC transfer
      const cleanInput = tx.input.replace("0x", "");
      
      // Parse target contract (Word 0, starts at char 8 after 4-byte selector)
      const targetContract = "0x" + cleanInput.substring(8 + 24, 8 + 64).toLowerCase();
      if (targetContract !== USDC_ADDRESS.toLowerCase()) {
        return { valid: false, reason: `Memo target contract is not USDC. Expected ${USDC_ADDRESS}, got ${targetContract}` };
      }

      // Inner data starts at Word 5 (byte offset 5 * 32 = 160 bytes -> char offset 8 + 5 * 64 = 328)
      // Length is 68 bytes (136 hex chars)
      const innerData = "0x" + cleanInput.substring(8 + 5 * 64, 8 + 5 * 64 + 136);
      transfer = parseTransferTx(innerData);
    } else {
      return { valid: false, reason: `Recipient contract (${tx.to}) is neither USDC nor the Memo contract.` };
    }

    if (!transfer) {
      return { valid: false, reason: "Not a standard ERC-20 transfer transaction payload." };
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

async function verifyAgentIdentity(agentId, userWallet) {
  try {
    const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
    const arg = BigInt(agentId).toString(16).padStart(64, "0");
    const data = "0x00339509" + arg;

    const res = await fetch(ARC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: IDENTITY_REGISTRY, data }, "latest"]
      })
    });
    const json = await res.json();
    if (json.error || !json.result || json.result === "0x") {
      return { valid: false, reason: "Agent ID not found in ERC-8004 registry." };
    }

    const registeredWallet = "0x" + json.result.slice(-40).toLowerCase();
    if (registeredWallet !== userWallet.toLowerCase()) {
      return {
        valid: false,
        reason: `Wallet mismatch on-chain. Registry has ${registeredWallet}, request has ${userWallet.toLowerCase()}`
      };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: "Identity verification failed: " + err.message };
  }
}

function screenWalletAddress(wallet, headers) {
  const simulateRiskHeader = headers["x-compliance-simulate-risk"] || headers["X-Compliance-Simulate-Risk"];
  const blockedWallet = "0x1111111111111111111111111111111111111111";

  if (wallet.toLowerCase() === blockedWallet.toLowerCase() || simulateRiskHeader === "high") {
    return {
      passed: false,
      riskScore: 98,
      riskCategory: "Severe / Direct AML Risk",
      vendor: "TRM Labs / Elliptic Simulation",
      reason: "OFAC Sanctioned Entity / High-Risk Wallet Association detected."
    };
  }
  return { passed: true, riskScore: 2, vendor: "TRM Labs / Elliptic Simulation" };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-USDC-Payment-Tx, X-Compliance-Simulate-Risk");
  res.setHeader("Access-Control-Expose-Headers", "X-USDC-Payment-Address, X-USDC-Amount, X-USDC-Chain-Id, X-USDC-Memo");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    items, userWallet: reqUserWallet, customerEmail, agentId, fulfillmentMethod = "delivery",
    deliveryFullName, deliveryPhone, deliveryAddressLine, deliveryCity, deliveryState, deliveryNotes
  } = req.body;


  // 1. Compliance Screening (TRM Labs / Elliptic Simulation)
  if (reqUserWallet) {
    const screening = screenWalletAddress(reqUserWallet, req.headers);
    if (!screening.passed) {
      return res.status(403).json({
        error: "COMPLIANCE_BLOCKED",
        message: `Transaction rejected by compliance: ${screening.reason}`,
        riskScore: screening.riskScore,
        riskCategory: screening.riskCategory
      });
    }
  }

  // 2. ERC-8004 Identity Verification (IdentityRegistry on Arc Testnet)
  if (agentId !== undefined && agentId !== null && agentId !== "" && reqUserWallet) {
    console.log(`[agent-checkout] Verifying agent identity on-chain for agentId ${agentId} and wallet ${reqUserWallet}...`);
    const identityResult = await verifyAgentIdentity(agentId, reqUserWallet);
    if (!identityResult.valid) {
      return res.status(400).json({
        error: "ERC8004_IDENTITY_MISMATCH",
        message: `Agent identity verification failed: ${identityResult.reason}`
      });
    }
    console.log(`[agent-checkout] Agent identity verified successfully!`);
  }

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
