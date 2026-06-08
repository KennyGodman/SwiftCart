/**
 * agent-triggers.js — Reorder & Price-Drop Trigger Management
 *
 * GET    /api/agent-triggers?wallet=0x...  — list triggers for a wallet
 * POST   /api/agent-triggers               — create trigger
 * DELETE /api/agent-triggers               — remove trigger (body: { id, wallet })
 *
 * Storage: Vercel KV (Redis) when available, falling back to in-memory for dev.
 *
 * Trigger schema:
 * {
 *   id:          string  (uuid)
 *   userWallet:  string  (0x...)
 *   productId:   string
 *   productName: string
 *   price:       number  (USDC)
 *   intervalDays:number
 *   maxPrice:    number  (agent asks if price > this)
 *   lastOrdered: string  (ISO date | null)
 *   nextOrder:   string  (ISO date)
 *   active:      boolean
 *   createdAt:   string  (ISO date)
 * }
 */

import crypto from "crypto";

// ── Storage adapter ───────────────────────────────────────────────────────────
// Uses Vercel KV if configured; falls back to a module-level Map for local dev.

let _kv = null;

async function getKV() {
  if (_kv) return _kv;
  try {
    const { kv } = await import("@vercel/kv");
    _kv = kv;
    return _kv;
  } catch {
    // Dev fallback — in-memory store (resets on cold start)
    if (!global.__agentTriggers) global.__agentTriggers = {};
    _kv = {
      async get(key)         { return global.__agentTriggers[key] ?? null; },
      async set(key, val)    { global.__agentTriggers[key] = val; },
      async del(key)         { delete global.__agentTriggers[key]; },
      // smembers / sadd / srem simulate a Redis Set with an array in JSON
      async smembers(key)    { return global.__agentTriggers[key] ?? []; },
      async sadd(key, val)   {
        const s = new Set(global.__agentTriggers[key] ?? []);
        s.add(val); global.__agentTriggers[key] = [...s];
      },
      async srem(key, val)   {
        const s = new Set(global.__agentTriggers[key] ?? []);
        s.delete(val); global.__agentTriggers[key] = [...s];
      },
    };
    return _kv;
  }
}

// Key helpers
const triggerKey  = (id)     => `trigger:${id}`;
const walletIndex = (wallet) => `wallet-triggers:${wallet.toLowerCase()}`;

// ── CRUD helpers ──────────────────────────────────────────────────────────────

async function createTrigger(data) {
  const kv = await getKV();
  const id = crypto.randomUUID();
  const now = new Date();
  const nextOrder = new Date(now);
  nextOrder.setDate(nextOrder.getDate() + (data.intervalDays || 30));

  const trigger = {
    id,
    userWallet:   data.userWallet.toLowerCase(),
    productId:    data.productId,
    productName:  data.productName || data.productId,
    price:        Number(data.price),
    intervalDays: Number(data.intervalDays || 30),
    maxPrice:     Number(data.maxPrice || data.price * 1.2),
    lastOrdered:  null,
    nextOrder:    nextOrder.toISOString().split("T")[0],
    active:       true,
    createdAt:    now.toISOString(),
  };

  await kv.set(triggerKey(id), trigger);
  await kv.sadd(walletIndex(data.userWallet), id);
  return trigger;
}

async function listTriggers(wallet) {
  const kv  = await getKV();
  const ids = await kv.smembers(walletIndex(wallet));
  if (!ids || ids.length === 0) return [];
  const triggers = await Promise.all(ids.map((id) => kv.get(triggerKey(id))));
  return triggers.filter(Boolean).filter((t) => t.active);
}

async function getTrigger(id) {
  const kv = await getKV();
  return await kv.get(triggerKey(id));
}

async function updateTrigger(id, updates) {
  const kv = await getKV();
  const existing = await kv.get(triggerKey(id));
  if (!existing) throw new Error(`Trigger ${id} not found`);
  const updated = { ...existing, ...updates };
  await kv.set(triggerKey(id), updated);
  return updated;
}

async function deleteTrigger(id, wallet) {
  const kv = await getKV();
  const existing = await kv.get(triggerKey(id));
  if (!existing) throw new Error(`Trigger ${id} not found`);
  if (existing.userWallet !== wallet.toLowerCase()) {
    throw new Error("Not authorized to delete this trigger");
  }
  await kv.set(triggerKey(id), { ...existing, active: false });
  await kv.srem(walletIndex(wallet), id);
  return true;
}

// Export for use by agent-cron.js
export { listTriggers, getTrigger, updateTrigger, getAllActiveTriggers };

async function getAllActiveTriggers() {
  // For the cron job — reads all trigger IDs from the global index
  const kv = await getKV();
  const allIds = await kv.smembers("all-triggers-index");
  if (!allIds || allIds.length === 0) return [];
  const triggers = await Promise.all(allIds.map((id) => kv.get(triggerKey(id))));
  return triggers.filter(Boolean).filter((t) => t.active);
}

// ── HTTP Handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ── GET /api/agent-triggers?wallet=0x... ──────────────────
    if (req.method === "GET") {
      const { wallet } = req.query;
      if (!wallet) return res.status(400).json({ error: "wallet query param required" });
      const triggers = await listTriggers(wallet);
      return res.status(200).json({ triggers });
    }

    // ── POST /api/agent-triggers ──────────────────────────────
    if (req.method === "POST") {
      const { userWallet, productId, productName, price, intervalDays, maxPrice } = req.body;
      if (!userWallet || !productId || !price || !intervalDays) {
        return res.status(400).json({
          error: "Required: userWallet, productId, price, intervalDays",
        });
      }

      const trigger = await createTrigger({
        userWallet, productId, productName, price, intervalDays, maxPrice,
      });

      // Also add to global index (for cron)
      const kv = await getKV();
      await kv.sadd("all-triggers-index", trigger.id);

      return res.status(201).json({ trigger });
    }

    // ── DELETE /api/agent-triggers ────────────────────────────
    if (req.method === "DELETE") {
      const { id, wallet } = req.body;
      if (!id || !wallet) {
        return res.status(400).json({ error: "Required: id, wallet" });
      }
      await deleteTrigger(id, wallet);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[agent-triggers]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
