import { useState } from "react";
import {
  ARC_CHAIN_ID,
  ARC_CHAIN_CONFIG,
  MEMO_ADDRESS
} from "../config";
import { encodeMemoUSDC } from "../utils";

export default function AgentSandboxModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [headers, setHeaders] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [paymentStep, setPaymentStep] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Agentic Economy states
  const [agentId, setAgentId] = useState("");
  const [trmRiskBlocked, setTrmRiskBlocked] = useState(false);
  const [reputationLog, setReputationLog] = useState(null);
  const [activeTab, setActiveTab] = useState("sandbox"); // "sandbox" | "mcp"
  const [mcpData, setMcpData] = useState(null);
  const [loadingMcp, setLoadingMcp] = useState(false);

  const fetchMcpSpecs = async () => {
    setLoadingMcp(true);
    try {
      const res = await fetch("/api/mcp");
      const data = await res.json();
      setMcpData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMcp(false);
    }
  };

  const simulateCheckout = async () => {
    setLoading(true);
    setResponse(null);
    setHeaders(null);
    setTxHash("");
    setPaymentStep(null);
    setErrorMessage("");
    setReputationLog(null);
    try {
      const headersMap = {
        "Content-Type": "application/json"
      };
      if (trmRiskBlocked) {
        headersMap["X-Compliance-Simulate-Risk"] = "high";
      }

      const bodyPayload = {
        items: [
          { id: "m-s1", qty: 1, size: "M", color: "Default" }
        ],
        userWallet: trmRiskBlocked ? "0x1111111111111111111111111111111111111111" : "0x1234567890123456789012345678901234567890",
        fulfillmentMethod: "delivery",
        deliveryState: "Lagos"
      };

      if (agentId && agentId.trim() !== "") {
        bodyPayload.agentId = Number(agentId);
      }

      const res = await fetch("/api/agent-checkout", {
        method: "POST",
        headers: headersMap,
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      
      const x402Headers = {
        "X-USDC-Payment-Address": res.headers.get("x-usdc-payment-address") || data.paymentRequired?.address || "Not returned",
        "X-USDC-Amount": res.headers.get("x-usdc-amount") ? `${res.headers.get("x-usdc-amount")} USDC` : (data.paymentRequired?.amount ? `${data.paymentRequired.amount}.00 USDC` : "Not returned"),
        "X-USDC-Chain-Id": res.headers.get("x-usdc-chain-id") || (data.paymentRequired?.chainId ? String(data.paymentRequired.chainId) : "Not returned"),
        "X-USDC-Memo": res.headers.get("x-usdc-memo") || data.paymentRequired?.memo || "Not returned"
      };

      setHeaders(x402Headers);
      setResponse({
        status: res.status,
        statusText: res.statusText,
        body: data
      });
    } catch (err) {
      setResponse({
        status: 500,
        statusText: "Error",
        body: { error: err.message }
      });
    } finally {
      setLoading(false);
    }
  };

  const executePayment = async () => {
    if (!window.ethereum) {
      alert("No Ethereum wallet detected. Please install MetaMask or Rabby.");
      return;
    }
    setPaymentStep("paying");
    setErrorMessage("");
    setReputationLog(null);

    try {
      // 1. Switch or Add Arc Testnet
      const currentChain = await window.ethereum.request({ method: "eth_chainId" });
      if (currentChain !== ARC_CHAIN_ID) {
        try {
          await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ARC_CHAIN_CONFIG] });
        } catch {
          try {
            await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID }] });
          } catch (se) {
            throw new Error("Please switch your wallet to the Arc Testnet.");
          }
        }
      }

      // 2. Request account if not already provided
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const buyerAddress = accounts[0];

      // 3. Extract parameters from the 402 payment details
      const amount = response.body.paymentRequired.amount;
      const memo = response.body.paymentRequired.memo;
      const recipient = response.body.paymentRequired.address;

      // 4. Encode on-chain Memo transaction
      const data = encodeMemoUSDC(recipient, amount, memo);
      
      const hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: buyerAddress, to: MEMO_ADDRESS, data, gas: "0x30D40" }],
      });

      setTxHash(hash);

      // 5. Wait for transaction to be mined
      const waitForReceipt = async (txHash) => {
        for (let i = 0; i < 30; i++) {
          const receipt = await window.ethereum.request({
            method: "eth_getTransactionReceipt",
            params: [txHash],
          });
          if (receipt) return receipt;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error("Transaction receipt timeout on Arc Testnet.");
      };

      await waitForReceipt(hash);

      // 6. Submit TxHash to final checkout endpoint
      setPaymentStep("verifying");
      const requestHeaders = {
        "Content-Type": "application/json",
        "X-USDC-Payment-Tx": hash
      };
      if (trmRiskBlocked) {
        requestHeaders["X-Compliance-Simulate-Risk"] = "high";
      }

      const bodyPayload = {
        items: [
          { id: "m-s1", qty: 1, size: "M", color: "Default" }
        ],
        userWallet: buyerAddress,
        fulfillmentMethod: "delivery",
        deliveryState: "Lagos"
      };

      if (agentId && agentId.trim() !== "") {
        bodyPayload.agentId = Number(agentId);
      }

      const checkoutRes = await fetch("/api/agent-checkout", {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(bodyPayload)
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        throw new Error(checkoutData.message || "Failed to finalize order verification.");
      }

      setResponse({
        status: checkoutRes.status,
        statusText: checkoutRes.statusText,
        body: checkoutData
      });

      // Write feedback to ReputationRegistry (ERC-8004) using the order's jobId
      if (agentId && checkoutData.order && checkoutData.order.jobId) {
        try {
          console.log(`[sandbox] Requesting reputation registry write feedback for Agent: ${agentId}`);
          const repRes = await fetch("/api/escrow?action=complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: checkoutData.order.jobId,
              agentId: Number(agentId),
              reason: "Checkout successfully settled programmatically"
            })
          });
          const repData = await repRes.json();
          if (repData.repTxHash) {
            setReputationLog(repData.repTxHash);
          }
        } catch (repErr) {
          console.error("Failed to write reputation feedback:", repErr);
        }
      }

      setPaymentStep("success");
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || "Execution failed.");
      setPaymentStep("error");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(15, 23, 42, 0.75)", backdropFilter: "blur(8px)", zIndex: 3000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16
    }}>
      <div style={{
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 20,
        width: "100%",
        maxWidth: 820,
        maxHeight: "92vh",
        overflowY: "auto",
        boxShadow: "var(--shadow-xl)",
        display: "flex",
        flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 24px", borderBottom: "1px solid var(--color-border)"
        }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--color-ink)", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              🤖 Agent Gateway Developer Sandbox
            </h3>
            <p style={{ fontSize: 11, color: "var(--color-ink-muted)", margin: "4px 0 0" }}>
              Explore and test SwiftCart's x402 and ERC-8004 machine-to-machine protocols.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-ink-muted)", cursor: "pointer", fontSize: 18 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{
          display: "flex", gap: 16, padding: "0 24px", borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)"
        }}>
          <button
            onClick={() => setActiveTab("sandbox")}
            style={{
              padding: "12px 6px", fontSize: 12, fontWeight: 700, border: "none",
              background: "none", color: activeTab === "sandbox" ? "var(--color-brand)" : "var(--color-ink-muted)",
              borderBottom: activeTab === "sandbox" ? "2px solid var(--color-brand)" : "2px solid transparent",
              cursor: "pointer"
            }}
          >
            ⚙️ Gateway Sandbox
          </button>
          <button
            onClick={() => {
              setActiveTab("mcp");
              if (!mcpData) fetchMcpSpecs();
            }}
            style={{
              padding: "12px 6px", fontSize: 12, fontWeight: 700, border: "none",
              background: "none", color: activeTab === "mcp" ? "var(--color-brand)" : "var(--color-ink-muted)",
              borderBottom: activeTab === "mcp" ? "2px solid var(--color-brand)" : "2px solid transparent",
              cursor: "pointer"
            }}
          >
            🔌 Model Context Protocol (MCP) Tools
          </button>
        </div>

        {/* Tab 2: MCP Tool discovery */}
        {activeTab === "mcp" && (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>🤖 Model Context Protocol Specifications</h4>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-ink-muted)" }}>
                Any autonomous AI agent implementing the MCP client standard can query this JSON endpoint to dynamically discover and call SwiftCart tools.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ink)" }}>Discovery URL:</span>
              <a href="/api/mcp" target="_blank" style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-brand)", textDecoration: "none" }}>
                {window.location.origin}/api/mcp ↗
              </a>
            </div>

            {loadingMcp ? (
              <div style={{ fontSize: 12, color: "var(--color-ink-muted)", padding: 40, textAlign: "center" }}>
                🔄 Loading MCP Tool discovery schemas...
              </div>
            ) : (
              <pre style={{
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 12, padding: 16, fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--color-ink-mid)", overflowX: "auto", maxHeight: "40vh"
              }}>
                {JSON.stringify(mcpData, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Tab 1: Sandbox checkout simulator */}
        {activeTab === "sandbox" && (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Docs Links */}
            <div style={{
              background: "var(--color-surface)", border: "1px solid var(--color-border)",
              borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12
            }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-ink)", margin: 0 }}>Agent Ecosystem Gateway</p>
                <p style={{ fontSize: 11, color: "var(--color-ink-muted)", margin: "2px 0 0" }}>Fully discovery-ready machine-readable endpoints.</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <a href="/agent-manifest.json" target="_blank" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-brand)", textDecoration: "none", background: "rgba(37,99,235,0.08)", padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(37,99,235,0.15)" }}>
                  📄 manifest.json
                </a>
                <a href="/api/products-api" target="_blank" style={{ fontSize: 11, fontWeight: 600, color: "var(--color-brand)", textDecoration: "none", background: "rgba(37,99,235,0.08)", padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(37,99,235,0.15)" }}>
                  🔍 Products API
                </a>
              </div>
            </div>

            {/* Sandbox columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 20 }}>
              {/* Left Column: Request */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink)", margin: 0 }}>Programmatic Agent Request Configuration</h4>
                
                {/* ERC-8004 Agent ID Input */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-ink-mid)" }}>
                    🛡️ Agent Identity Token ID (ERC-8004 on Arc Testnet)
                  </label>
                  <input
                    type="number"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="Enter Agent ID (e.g. 1)"
                    style={{
                      padding: "8px 12px", fontSize: 11, borderRadius: 8,
                      border: "1px solid var(--color-border)", background: "var(--color-bg)",
                      color: "var(--color-ink)"
                    }}
                  />
                  <p style={{ margin: 0, fontSize: 9, color: "var(--color-ink-muted)" }}>
                    Checks on-chain registry mapping `0x8004...9e` to verify the buyer's wallet owns this Agent NFT card.
                  </p>
                </div>

                {/* TRM Compliance Simulator Checkbox */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: 10,
                  background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 8
                }}>
                  <input
                    type="checkbox"
                    id="trmToggle"
                    checked={trmRiskBlocked}
                    onChange={(e) => setTrmRiskBlocked(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label htmlFor="trmToggle" style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", cursor: "pointer" }}>
                    ⚠️ Simulate High Risk AML Wallet Flag (TRM Labs Simulation)
                  </label>
                </div>

                <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-ink-mid)" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <span style={{ background: "var(--color-brand)", color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>POST</span>
                    <span>/api/agent-checkout</span>
                  </div>
                  <pre style={{ margin: 0, overflowX: "auto" }}>
{`{
  "items": [
    { "id": "m-s1", "qty": 1 }
  ],
  "userWallet": "${trmRiskBlocked ? "0x1111...1111" : "0x1234...7890"}",
  ${agentId ? `"agentId": ${agentId},` : ""}
  "fulfillmentMethod": "delivery",
  "deliveryState": "Lagos"
}`}
                  </pre>
                </div>

                <button
                  onClick={simulateCheckout}
                  disabled={loading}
                  style={{
                    background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-dk))",
                    color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "opacity 0.2s"
                  }}
                >
                  {loading ? "Simulating Request..." : "Simulate Agent Checkout 🤖"}
                </button>
              </div>

              {/* Right Column: Response */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink)", margin: 0 }}>Programmatic x402 Response</h4>
                
                {!response ? (
                  <div style={{
                    flex: 1, border: "1px dashed var(--color-border)", borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-ink-muted)", fontSize: 12,
                    minHeight: 250, padding: 12, textAlign: "center"
                  }}>
                    Click the button to run the programmatic API request and display the returned x402 headers & payload.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Status */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>HTTP Status:</span>
                      <span style={{
                        background: response.status === 402 ? "rgba(220,38,38,0.1)" : (response.status === 403 ? "rgba(220,38,38,0.15)" : "rgba(16,185,129,0.1)"),
                        color: response.status === 402 ? "var(--color-sale)" : (response.status === 403 ? "#b91c1c" : "var(--color-success)"),
                        padding: "2px 8px", borderRadius: 6, fontWeight: 700
                      }}>
                        {response.status} {response.statusText}
                      </span>
                    </div>

                    {/* Headers */}
                    {headers && response.status === 402 && (
                      <div style={{
                        background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.15)",
                        borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 11
                      }}>
                        <div style={{ fontWeight: 700, color: "var(--color-brand)", marginBottom: 4 }}>Returned Protocol Headers:</div>
                        {Object.entries(headers).map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "var(--color-ink-muted)", fontFamily: "var(--font-mono)" }}>{k}:</span>
                            <span style={{ color: "var(--color-ink)", fontFamily: "var(--font-mono)", fontWeight: 600, wordBreak: "break-all" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Body JSON */}
                    <div style={{
                      background: "var(--color-surface)", border: "1px solid var(--color-border)",
                      borderRadius: 10, padding: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-ink-mid)",
                      maxHeight: 140, overflowY: "auto"
                    }}>
                      <pre style={{ margin: 0 }}>
                        {JSON.stringify(response.body, null, 2)}
                      </pre>
                    </div>

                    {/* STEP 2: COMPLETE ON-CHAIN PAYMENT */}
                    {response.status === 402 && (
                      <div style={{
                        marginTop: 6, padding: "12px 16px", background: "rgba(16,185,129,0.06)",
                        border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8
                      }}>
                        <div>
                          <h5 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#0f766e" }}>💳 Step 2: Complete Checkout Payment</h5>
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--color-ink-muted)" }}>
                            Simulate the buying agent signing the USDC payment transaction on-chain via MetaMask.
                          </p>
                        </div>

                        {paymentStep === null && (
                          <button
                            onClick={executePayment}
                            style={{
                              background: "#0f766e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px",
                              fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "opacity 0.2s"
                            }}
                          >
                            Execute Wallet Payment & Finalize Order
                          </button>
                        )}

                        {paymentStep === "paying" && (
                          <div style={{ fontSize: 10, color: "var(--color-ink-mid)", display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="spinner" style={{ border: "2px solid #ccc", borderTop: "2px solid #0f766e", borderRadius: "50%", width: 12, height: 12, display: "inline-block", animation: "spin 1s linear infinite" }}></span>
                            {txHash ? `Confirming Tx on Arc: ${txHash.slice(0, 12)}...` : "Waiting for signature in MetaMask..."}
                          </div>
                        )}

                        {paymentStep === "verifying" && (
                          <div style={{ fontSize: 10, color: "var(--color-ink-mid)" }}>
                            🔄 Payment confirmed on-chain! Finalizing order verification...
                          </div>
                        )}

                        {paymentStep === "success" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f766e" }}>
                              🎉 Success! Transaction verified on-chain, and order registered!
                            </div>
                            
                            {/* Live Reputation log display */}
                            {reputationLog && (
                              <div style={{
                                padding: 8, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)",
                                borderRadius: 8, fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--color-ink-mid)"
                              }}>
                                ✍️ <strong>ERC-8004 Reputation Feed:</strong> Rating written successfully on-chain! <br/>
                                Tx: <a href={`https://testnet.arcscan.app/tx/${reputationLog}`} target="_blank" style={{ color: "var(--color-brand)", wordBreak: "break-all" }}>
                                  {reputationLog.slice(0, 20)}...
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        {paymentStep === "error" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ fontSize: 10, color: "#dc2626" }}>Error: {errorMessage}</span>
                            <button
                              onClick={executePayment}
                              style={{
                                background: "#0f766e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px",
                                fontSize: 11, fontWeight: 700, cursor: "pointer"
                              }}
                            >
                              Retry Payment
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid var(--color-border)",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12
        }}>
          <p style={{ fontSize: 11, color: "var(--color-ink-muted)", margin: 0 }}>
            🛡️ Circle Agent Wallet Integrations enabled with limits & whitelisted counterparties.
          </p>
          <button
            onClick={onClose}
            style={{
              background: "var(--color-surface)", color: "var(--color-ink)",
              border: "1px solid var(--color-border)", borderRadius: 8, padding: "8px 16px",
              fontSize: 11, fontWeight: 600, cursor: "pointer"
            }}
          >
            Close Sandbox
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
