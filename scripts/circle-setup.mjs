/**
 * circle-setup.mjs — One-time Circle Developer Wallet Setup
 *
 * Run this ONCE to create your Circle agent wallet for ArcWear.
 *
 * Prerequisites:
 *   1. Sign up at https://console.circle.com/
 *   2. Create a project → grab your API Key
 *   3. Add CIRCLE_API_KEY to your .env
 *   4. Generate a random entity secret (see step 0 below)
 *
 * Usage:
 *   node scripts/circle-setup.mjs
 *
 * Output: CIRCLE_WALLET_ID, CIRCLE_WALLET_SET_ID, and agent wallet address
 *         → copy these into your .env file
 */

import crypto from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no dotenv dependency needed) ─────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) {
    console.error("❌  .env file not found. Create one from .env.example first.");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

loadEnv();

const CIRCLE_API_KEY     = process.env.CIRCLE_API_KEY;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;
const BASE_URL           = "https://api.circle.com/v1/w3s";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch Circle's RSA public key for this API key */
async function getEntityPublicKey() {
  const res = await fetch(`${BASE_URL}/config/entity/publicKey`, {
    headers: { Authorization: `Bearer ${CIRCLE_API_KEY}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Circle API error: ${JSON.stringify(body)}`);
  return body.data.publicKey;
}

/** Encrypt the 32-byte hex entity secret using Circle's RSA public key */
function encryptEntitySecret(hexSecret, publicKeyPem) {
  const key = crypto.createPublicKey(publicKeyPem);
  const encrypted = crypto.publicEncrypt(
    {
      key,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(hexSecret, "hex")
  );
  return encrypted.toString("base64");
}

/** Create a wallet set (registers your entity secret with Circle) */
async function createWalletSet(entitySecretCiphertext) {
  const res = await fetch(`${BASE_URL}/developer/walletSets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext,
      name: "ArcWear Agent Wallets",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`createWalletSet failed: ${JSON.stringify(body)}`);
  return body.data.walletSet;
}

/** Create one ARC-TESTNET wallet inside the wallet set */
async function createWallet(walletSetId, entitySecretCiphertext) {
  const res = await fetch(`${BASE_URL}/developer/wallets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      entitySecretCiphertext,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      walletSetId,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`createWallet failed: ${JSON.stringify(body)}`);
  return body.data.wallets[0];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔵 SwiftCart — Circle Agent Wallet Setup\n");
  console.log("═".repeat(50));

  // ── Step 0: Validate env ──────────────────────────────
  if (!CIRCLE_API_KEY) {
    console.error("\n❌  CIRCLE_API_KEY is not set in .env");
    console.error(
      "   → Get one at: https://console.circle.com/ → API Keys\n"
    );
    process.exit(1);
  }

  if (!CIRCLE_ENTITY_SECRET) {
    // Generate one for them
    const generated = crypto.randomBytes(32).toString("hex");
    console.log("\n⚠️   CIRCLE_ENTITY_SECRET is not set in .env");
    console.log(
      "   → A random secret has been generated for you.\n"
    );
    console.log("   Add this to your .env:\n");
    console.log(`   CIRCLE_ENTITY_SECRET=${generated}\n`);
    console.log(
      "   ⚠️  Keep this secret PRIVATE. It controls your agent wallet.\n"
    );
    console.log("   Then re-run this script.\n");
    process.exit(0);
  }

  // Validate entity secret is 64-char hex
  if (!/^[0-9a-f]{64}$/i.test(CIRCLE_ENTITY_SECRET)) {
    console.error(
      "\n❌  CIRCLE_ENTITY_SECRET must be a 64-character hex string (32 bytes)."
    );
    console.error(
      "   Run the script without it set to generate one automatically.\n"
    );
    process.exit(1);
  }

  // ── Step 1: Fetch Circle entity public key ────────────
  console.log("\n1️⃣  Fetching Circle entity public key...");
  const publicKey = await getEntityPublicKey();
  console.log("   ✅  Got RSA public key");

  // ── Step 2: Encrypt entity secret ────────────────────
  console.log("\n2️⃣  Encrypting entity secret with Circle's public key...");
  const entitySecretCiphertext = encryptEntitySecret(CIRCLE_ENTITY_SECRET, publicKey);
  console.log("   ✅  Encrypted");

  // ── Step 3: Create wallet set ─────────────────────────
  console.log("\n3️⃣  Creating wallet set ('ArcWear Agent Wallets')...");
  const walletSet = await createWalletSet(entitySecretCiphertext);
  console.log(`   ✅  Wallet Set ID: ${walletSet.id}`);

  // ── Step 4: Create wallet on ARC-TESTNET ─────────────
  console.log("\n4️⃣  Creating developer wallet on ARC-TESTNET...");
  const freshCiphertextForWallet = encryptEntitySecret(CIRCLE_ENTITY_SECRET, publicKey);
  const wallet = await createWallet(walletSet.id, freshCiphertextForWallet);
  console.log(`   ✅  Wallet created`);
  console.log(`   🆔  Wallet ID:      ${wallet.id}`);
  console.log(`   📬  Wallet Address: ${wallet.address}`);

  // ── Result ────────────────────────────────────────────
  console.log("\n" + "═".repeat(50));
  console.log("📋  Generated details:\n");
  console.log(`   Wallet Set ID:      ${walletSet.id}`);
  console.log(`   Wallet ID:          ${wallet.id}`);
  console.log(`   Wallet Address:     ${wallet.address}`);
  console.log("\n" + "═".repeat(50));

  // ── Auto-Update .env and config.js ────────────────────
  try {
    const fs = await import("fs");
    const path = await import("path");
    
    // Update .env
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, "utf8");
      
      const replaceOrAppend = (content, key, value) => {
        const regex = new RegExp(`^${key}=.*$`, "m");
        if (regex.test(content)) {
          return content.replace(regex, `${key}=${value}`);
        }
        return content + (content.endsWith("\n") ? "" : "\n") + `${key}=${value}\n`;
      };
      
      envContent = replaceOrAppend(envContent, "CIRCLE_WALLET_SET_ID", walletSet.id);
      envContent = replaceOrAppend(envContent, "CIRCLE_WALLET_ID", wallet.id);
      envContent = replaceOrAppend(envContent, "CIRCLE_AGENT_ADDRESS", wallet.address);
      
      fs.writeFileSync(envPath, envContent, "utf8");
      console.log("   💾  Auto-updated .env with new wallet details!");
    }

    // Update src/config.js
    const configPath = path.resolve(__dirname, "../src/config.js");
    if (fs.existsSync(configPath)) {
      let configContent = fs.readFileSync(configPath, "utf8");
      const regex = /export const AGENT_WALLET = "[^"]*";/;
      if (regex.test(configContent)) {
        configContent = configContent.replace(regex, `export const AGENT_WALLET = "${wallet.address}";`);
        fs.writeFileSync(configPath, configContent, "utf8");
        console.log("   💾  Auto-updated src/config.js with new AGENT_WALLET address!");
      }
    }
  } catch (updateErr) {
    console.warn("   ⚠️  Failed to auto-update files:", updateErr.message);
  }

  console.log("\n✅  Setup complete. Your agent wallet is ready!\n");
}

main().catch((err) => {
  console.error("\n❌  Setup failed:", err.message);
  process.exit(1);
});
