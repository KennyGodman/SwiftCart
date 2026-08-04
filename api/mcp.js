export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    mcpVersion: "0.1.0",
    name: "SwiftCart Protocol",
    description: "On-chain Autonomous Commerce Gateway for Arc L1 and Circle Programmable Wallets. Allows agents to query product catalogue and complete checkouts using USDC.",
    tools: [
      {
        name: "list_products",
        description: "Search and list clothing items in the SwiftCart luxury catalog. Allows filtering by query keywords, section (gender), category, or price range.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Optional keyword search query (e.g. 'black shirt')"
            },
            section: {
              type: "string",
              description: "Optional section filter ('men', 'women', 'kids')"
            },
            category: {
              type: "string",
              description: "Optional category filter (e.g. 'Shirts', 'Trousers', 'Belts', 'Caps', 'Shoes')"
            },
            minPrice: {
              type: "number",
              description: "Minimum price in USDC"
            },
            maxPrice: {
              type: "number",
              description: "Maximum price in USDC"
            }
          }
        }
      },
      {
        name: "agent_checkout",
        description: "Initiate programmatic checkout on SwiftCart using the x402 protocol. Expects an items array, fulfillment details, and an optional agentId for ERC-8004 identity verification.",
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Product SKU ID" },
                  qty: { type: "integer", description: "Quantity to order" },
                  size: { type: "string", description: "Fitted size (e.g. 'M', 'L', 'Default')" },
                  color: { type: "string", description: "Color name (e.g. 'Default')" }
                },
                required: ["id", "qty"]
              }
            },
            userWallet: { type: "string", description: "Buyer's Ethereum wallet address" },
            agentId: { type: "integer", description: "Optional ERC-8004 Agent NFT profile Token ID for verification" },
            fulfillmentMethod: { type: "string", enum: ["delivery", "pickup"] },
            deliveryState: { type: "string", description: "Delivery destination state (e.g. 'Lagos', 'Abuja')" }
          },
          required: ["items", "userWallet", "fulfillmentMethod"]
        }
      }
    ]
  });
}
