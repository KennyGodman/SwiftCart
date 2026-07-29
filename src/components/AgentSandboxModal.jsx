import { useState } from "react";

export default function AgentSandboxModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [headers, setHeaders] = useState(null);

  const simulateCheckout = async () => {
    setLoading(true);
    setResponse(null);
    setHeaders(null);
    try {
      const res = await fetch("/api/agent-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: [
            { id: "m-s1", qty: 1, size: "M", color: "Default" }
          ],
          userWallet: "0x1234567890123456789012345678901234567890",
          fulfillmentMethod: "delivery",
          deliveryState: "Lagos"
        })
      });

      const data = await res.json();
      
      // Capture the target x402 headers
      const x402Headers = {
        "X-USDC-Payment-Address": res.headers.get("x-usdc-payment-address") || "Not returned",
        "X-USDC-Amount": res.headers.get("x-usdc-amount") || "Not returned",
        "X-USDC-Chain-Id": res.headers.get("x-usdc-chain-id") || "Not returned",
        "X-USDC-Memo": res.headers.get("x-usdc-memo") || "Not returned"
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
        maxWidth: 780,
        maxHeight: "90vh",
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
              Explore and test SwiftCart's x402 machine-to-machine protocol integrations.
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

        {/* Content */}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Left Column: Request */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "var(--color-ink)", margin: 0 }}>Programmatic Agent Request</h4>
              
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
  "userWallet": "0x1234...7890",
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
                  minHeight: 200, padding: 12, textAlign: "center"
                }}>
                  Click the button to run the programmatic API request and display the returned x402 headers & payload.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Status */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>HTTP Status:</span>
                    <span style={{
                      background: response.status === 402 ? "rgba(220,38,38,0.1)" : "rgba(16,185,129,0.1)",
                      color: response.status === 402 ? "var(--color-sale)" : "var(--color-success)",
                      padding: "2px 8px", borderRadius: 6, fontWeight: 700
                    }}>
                      {response.status} {response.statusText}
                    </span>
                  </div>

                  {/* Headers */}
                  {headers && (
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
                    maxHeight: 120, overflowY: "auto"
                  }}>
                    <pre style={{ margin: 0 }}>
                      {JSON.stringify(response.body, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

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
    </div>
  );
}
