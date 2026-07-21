const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ESCROW_CONTRACT = "0x642Ae8983e31050387Ad5c0A45A7fdD53EB11ac7";
const AGENT_ADDRESS = "0x51894a584a1e186151b31b23ea3add16fce5ff56";
const USER_WALLET = "0x4932B6c1970131321B79d8Be02A1791A09554bf5";
const ARC_RPC = "https://rpc.testnet.arc.network";

async function ethCall(to, data) {
  const res = await fetch(ARC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`eth_call error: ${json.error.message}`);
  return json.result;
}

async function getBalance() {
  const account = USER_WALLET.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = "0x70a08231" + account; // balanceOf(address)
  const result = await ethCall(USDC_ADDRESS, data);
  return parseInt(result, 16) / 1e6;
}

async function getAllowance(spenderAddr) {
  const owner = USER_WALLET.toLowerCase().replace("0x", "").padStart(64, "0");
  const spender = spenderAddr.toLowerCase().replace("0x", "").padStart(64, "0");
  const data = "0xdd62ed3e" + owner + spender; // allowance(address,address)
  const result = await ethCall(USDC_ADDRESS, data);
  return parseInt(result, 16) / 1e6; // USDC has 6 decimals
}

async function run() {
  try {
    const escrowAllowance = await getAllowance(ESCROW_CONTRACT);
    const agentAllowance = await getAllowance(AGENT_ADDRESS);
    const balance = await getBalance();
    console.log(`User Wallet: ${USER_WALLET}`);
    console.log(`USDC Balance: ${balance} USDC`);
    console.log(`Allowance to Escrow Contract (${ESCROW_CONTRACT}): ${escrowAllowance} USDC`);
    console.log(`Allowance to Agent Wallet (${AGENT_ADDRESS}): ${agentAllowance} USDC`);
  } catch (err) {
    console.error("Failed to query allowance:", err.message);
  }
}

run();
