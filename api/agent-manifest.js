export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    name: "SwiftCart Protocol",
    description: "On-chain Autonomous Commerce Gateway for Arc L1 and Circle Programmable Wallets. Allows agents to query product catalogue and complete checkouts using USDC.",
    version: "1.0.0",
    developer: "Kenny Godman",
    gateway: "https://swiftcart-shop.vercel.app",
    x402: {
      supported: true,
      chain: "Arc Testnet (L1)",
      chainId: 511,
      paymentToken: "0x3600000000000000000000000000000000000000",
      endpoints: {
        product_lookup: "/api/products-api",
        checkout: "/api/agent-checkout"
      }
    },
    spending_policies: {
      max_transaction_limit: "500 USDC",
      daily_cumulative_limit: "1000 USDC",
      whitelisted_token: "USDC (0x3600000000000000000000000000000000000000)",
      whitelisted_merchants": [
        "0xd515765a6c9b1c3f9a4df52f5326eea43ee42469"
      ]
    },
    api_spec: {
      endpoints: [
        {
          path: "/api/agent-manifest",
          method: "GET",
          description: "Returns this manifest file",
          auth: "none"
        },
        {
          path: "/api/products-api",
          method: "GET",
          description: "Search products by keywords, categories, or price range. Query is free.",
          auth: "none"
        },
        {
          path: "/api/agent-checkout",
          method: "POST",
          description: "Programmatic checkout. Expects items list and payment proof or triggers x402 payment flow.",
          auth: "x402"
        }
      ]
    }
  });
}
