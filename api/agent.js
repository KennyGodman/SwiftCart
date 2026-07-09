function getSafeMessagesSlice(messages, limit = 4) {
  if (!Array.isArray(messages) || messages.length <= limit) return messages;
  
  let startIndex = messages.length - limit;
  
  // Ensure we don't slice in the middle of a tool call/response pair.
  // If the first message in our slice is a user message containing tool results,
  // we must move startIndex backward to include the assistant message that called the tool.
  while (startIndex > 0) {
    const msg = messages[startIndex];
    if (msg.role === "user" && Array.isArray(msg.content) && msg.content.some(b => b.type === "tool_result")) {
      startIndex--;
    } else {
      break;
    }
  }
  
  return messages.slice(startIndex);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    messages, tools, allowance, wallet, wishlist, cart, customerEmail,
    fulfillmentMethod, deliveryAddress, pickupLocation,
    deliveryFullName, deliveryPhone, deliveryAddressLine,
    deliveryCity, deliveryState, deliveryNotes, deliveryFee
  } = req.body;
  const slicedMessages = getSafeMessagesSlice(messages, 4);

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  try {
    // Convert messages from Anthropic format to OpenAI/Groq format
    const groqMessages = [];

    const walletStr = wallet ? wallet : "Not Connected";
    const allowanceStr = allowance !== undefined && allowance !== null ? `${allowance} USDC` : "0 USDC";
    const emailStr = customerEmail ? customerEmail : "Not Configured";
    const wishlistItems = Array.isArray(wishlist) ? wishlist : [];
    const wishlistStr = wishlistItems.length > 0
      ? wishlistItems.map(item => `${item.name} (${item.price} USDC, ID: ${item.id})`).join(", ")
      : "No items in wishlist";
    const cartItems = Array.isArray(cart) ? cart : [];
    const cartTotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const cartStr = cartItems.length > 0
      ? cartItems.map(item => `${item.name} (Qty: ${item.qty}, Price: ${item.price} USDC)`).join(", ") + ` — Total: ${cartTotal} USDC`
      : "Empty";

    // Add system message first
    groqMessages.push({
      role: "system",
      content: `You are ArcWear's autonomous AI shopping agent on Arc Blockchain (Circle L1).

CURRENT USER STATUS:
- Connected Wallet: ${walletStr}
- Pre-approved USDC Allowance: ${allowanceStr}
- Customer Email: ${emailStr}
- Current Cart: ${cartStr}
- User's Wishlist: ${wishlistStr}
- Fulfillment Method: ${fulfillmentMethod ? fulfillmentMethod.toUpperCase() : "DELIVERY"}
- Store Pickup Location: ${pickupLocation ? pickupLocation : "Not Set"}
- Shipping/Delivery Details:
  - Full Name: ${deliveryFullName || "Not Set"}
  - Phone: ${deliveryPhone || "Not Set"}
  - Street Address: ${deliveryAddressLine || "Not Set"}
  - City: ${deliveryCity || "Not Set"}
  - State/Zone: ${deliveryState || "Not Set"}
  - Notes: ${deliveryNotes || "None"}
  - Delivery Fee: ${deliveryFee ? `${deliveryFee} USDC` : "0.00 USDC"}

CORE TOOLS:
- search_products: Search the catalogue by section (fashion/appliances/gaming/electronics/phones_gadgets/health_beauty/home_office), category, price, keywords
- add_to_cart: Add a product to the user's cart by ID
- view_cart: See current cart contents and total
- remove_from_cart: Remove a product from the cart

AUTONOMOUS TOOLS:
- check_allowance: Check if user has pre-approved USDC spending for you. Call this before any autonomous checkout.
- request_approval: Ask user to approve a USDC spending allowance so you can purchase without wallet popups. Use when allowance is 0 or insufficient.
- agent_checkout: Execute checkout using the pre-approved USDC allowance — INSTANT, NO wallet popup. Only works when allowance >= cart total.
- create_reorder: Set up automatic reorder for a product at a regular interval. The user will receive a confirmation notification before each reorder executes.
- add_to_wishlist: Add a product to the user's wishlist by ID.
- remove_from_wishlist: Remove a product from the user's wishlist by ID.
- view_wishlist: View the user's wishlist contents.
- set_fulfillment_details: Update the user's fulfillment preferences (method: "delivery" or "pickup", and corresponding structured fields).

CHECKOUT FLOW (IMPORTANT — AGENT-ONLY, NO MANUAL CHECKOUT):
All purchases MUST go through the autonomous agent path. Never use 'initiate_checkout'. Follow these steps:
1. Look at the pre-approved USDC Allowance under CURRENT USER STATUS.
   - If allowance >= cart total: immediately call 'agent_checkout' to execute the purchase autonomously. No wallet popup needed.
   - If allowance is 0 or insufficient (< cart total): immediately call 'request_approval' with an appropriate amount (e.g. 500 USDC or cart total + buffer). Do NOT just mention it in text — call the tool so the approval modal appears.
2. NEVER call 'initiate_checkout' under any circumstances — it is disabled. There is no manual checkout option.
3. NEVER call 'check_allowance' before checkout — you already have the allowance value in CURRENT USER STATUS. Use it directly.
4. When 'agent_checkout' completes, report the transaction hash (txHash) and confirm the purchase in your text response.

SIZE REQUEST RULES:
- For fashion/clothing products (e.g. shirts, tops, trousers, coats, items in the 'fashion' section), you MUST ask the user for their preferred size (XS, S, M, L, XL, XXL) before adding the item to the cart or checking out.
- Do NOT assume a size unless the user has explicitly stated it in their request. If they haven't, politely ask: "What size would you like for the [Product Name]?"
- Pass the selected size to the 'add_to_cart' tool's 'size' property.

FULFILLMENT RULES:
- Before executing 'agent_checkout', you MUST ensure that a fulfillment method is configured.
- If the fulfillment method is 'delivery', the user MUST have their Shipping/Delivery Details configured (Full Name, Phone, Street Address, City, and State).
- If any of these fields are "Not Set", you MUST ask the user for the missing fields (or ask them to provide their complete shipping info). Once provided, call the 'set_fulfillment_details' tool to save all of these attributes.
- Inform the user that the delivery fee is calculated dynamically based on their State/Zone: Lagos is 5.00 USDC, Abuja is 8.00 USDC, Rivers is 10.00 USDC, and any other state is 6.00 USDC.
- If the fulfillment method is 'pickup', the user MUST have a Store Pickup Location set. If it is "Not Set", you MUST ask the user to choose their preferred store location. Once chosen, call the 'set_fulfillment_details' tool.
- If the user has not specified a preference, default to 'delivery' but ask them to confirm their address details.
- You can call 'set_fulfillment_details' to update the user's fulfillment preferences anytime they request to change it.

REORDER RULES:
- When setting up reorders, clearly state: product, interval, max price guard
- Reorders send a confirmation notification BEFORE executing — user has 24h to cancel
- Be proactive: if a user buys the same item repeatedly, suggest a reorder

WISHLIST RULES:
- Under CURRENT USER STATUS, you can see the user's wishlist of products.
- When the user asks for suggestions, recommendations, or outfit looks, you MUST reference items in their wishlist if they are relevant, or recommend matching items that complement the wishlisted products.
- If the user asks to add or remove items from the wishlist, you MUST call 'add_to_wishlist' or 'remove_from_wishlist' tool respectively. Do not just say you are doing it in text.

TOOL CALLING RULES (CRITICAL):
1. Whenever you want to search products, add items to the cart, view the cart, remove items from the cart, checkout, or request allowance approvals, or manage the wishlist, or update fulfillment details, you MUST call the corresponding tool. Do NOT just write in text that you are doing it. You must generate the tool call block so the system actually performs the action.
2. If you state "Adding X to cart" or "I'll add X to your cart", you MUST emit the 'add_to_cart' tool call for that item. Do not pretend to add items without calling the tool.
3. If search_products returns 0 results (no products found), do NOT keep calling search_products in a loop. Instead, immediately respond to the user in plain text explaining that the item is not in our catalog, and suggest other products or ask for clarification.

TONE: Helpful, concise, confident. Always show USDC prices. After adding items, summarise with prices.`,
    });

    // Convert message history with token pruning for older tool results
    const totalMsgs = slicedMessages.length;
    for (let idx = 0; idx < totalMsgs; idx++) {
      const msg = slicedMessages[idx];
      const isOld = idx < totalMsgs - 2;

      if (msg.role === "user") {
        // Handle tool results in user messages (Anthropic format)
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === "tool_result") {
              let contentStr = typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);

              // Token pruning: if it's an old search tool result, prune to save token limits
              if (isOld && contentStr.includes("products")) {
                try {
                  const parsed = JSON.parse(contentStr);
                  if (parsed.products) {
                    contentStr = JSON.stringify({
                      found: parsed.found,
                      message: "Search completed (details pruned to save token limits)"
                    });
                  }
                } catch {
                  // Ignore parse failures
                }
              }

              groqMessages.push({
                role: "tool",
                tool_call_id: block.tool_use_id,
                content: contentStr,
              });
            }
          }
        } else {
          groqMessages.push({ role: "user", content: msg.content });
        }
      } else if (msg.role === "assistant") {
        // Handle assistant messages with tool calls (Anthropic format)
        if (Array.isArray(msg.content)) {
          const textContent = msg.content
            .filter(b => b.type === "text")
            .map(b => b.text)
            .join("");
          const toolCalls = msg.content
            .filter(b => b.type === "tool_use")
            .map(b => ({
              id: b.id,
              type: "function",
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input),
              },
            }));

          const assistantMsg = { role: "assistant" };
          if (textContent) assistantMsg.content = textContent;
          if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
          groqMessages.push(assistantMsg);
        } else {
          groqMessages.push({ role: "assistant", content: msg.content });
        }
      }
    }

    // Convert tools from Anthropic format to OpenAI/Groq format
    const groqTools = (tools || []).map(t => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: "object", properties: {} },
      },
    }));

    // Call Groq API with fallback and retry logic
    const candidateModels = [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "qwen/qwen3.6-27b"
    ];

    let lastError = null;
    let data = null;
    let response = null;
    let successfulModel = null;

    for (const model of candidateModels) {
      console.log(`[agent] Attempting chat completion with model: ${model}`);
      const MAX_RETRIES = 3;
      let modelSucceeded = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages: groqMessages,
              tools: groqTools.length > 0 ? groqTools : undefined,
              tool_choice: groqTools.length > 0 ? "auto" : undefined,
              max_tokens: 1000,
              temperature: 0.3,
            }),
          });

          data = await response.json();

          if (response.status === 429) {
            console.warn(`[agent] Model ${model} rate limited (429). Details: ${JSON.stringify(data.error || data)}. Falling back to next model immediately.`);
            break; // Break retry loop to try next model immediately
          }

          if (!response.ok) {
            throw new Error(data.error?.message || `API error (${response.status})`);
          }

          modelSucceeded = true;
          successfulModel = model;
          break; // success
        } catch (err) {
          console.error(`[agent] Attempt with model ${model} failed on attempt ${attempt + 1}:`, err.message);
          lastError = err;
        }
      }

      if (modelSucceeded) {
        console.log(`[agent] Successfully generated response using model: ${successfulModel}`);
        break;
      }
    }

    if (!successfulModel) {
      console.error("[agent] All models failed. Last error:", lastError?.message);
      return res.status(500).json({ error: lastError?.message || "All Groq models failed" });
    }

    const message = data.choices?.[0]?.message;

    if (!message) {
      return res.status(500).json({ error: "No response from Groq" });
    }

    // Convert Groq response back to Anthropic format for frontend
    const content = [];

    if (message.content) {
      content.push({ type: "text", text: message.content });
    }

    if (message.tool_calls?.length > 0) {
      for (const tc of message.tool_calls) {
        let input = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch (e) {
          input = {};
        }
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
    }

    return res.status(200).json({ content });

  } catch (error) {
    console.error("Agent error:", error);
    return res.status(500).json({ error: error.message });
  }
}