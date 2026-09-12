import React, { useState, useEffect } from "react";

/**
 * AdvertFlashModal — High-impact promotional advert flash modal
 * Showcases the newly dropped USDC Football Kits with interactive selection,
 * quick add-to-cart, detail viewing, and store navigation.
 */
export default function AdvertFlashModal({
  isOpen,
  onClose,
  kits = [],
  onAddToCart,
  onViewDetail,
  onNavigateToKits,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState("L");
  const [justAdded, setJustAdded] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Sync with default kits if empty
  const activeKit = kits[selectedIndex] || kits[0] || {
    id: "m-kit-blue",
    name: "USDC by Circle Home Kit 2026/27",
    price: 85,
    oldPrice: 110,
    desc: "Men · Royal Blue Matchday Edition with Official USDC by Circle Sponsor & Club Crest",
    img: "/kits/usdc-kit-blue.png",
    badge: "Official Drop",
    availableCustomisation: "USDC by Circle available via the customisation options"
  };

  const SIZES = ["S", "M", "L", "XL", "XXL"];

  const handleAddToCart = (e) => {
    e.stopPropagation();
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
    if (onAddToCart) {
      onAddToCart({
        ...activeKit,
        selectedSize: selectedSize,
        categoryLabel: "USDC Football Kits",
        sectionLabel: "Fashion",
      });
    }
  };

  const handleClose = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem("arcwear_advert_dismissed", Date.now().toString());
      } catch (err) {
        console.warn("Storage error", err);
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="advert-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(10, 15, 29, 0.78)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        animation: "advertBackdropFadeIn 0.35s ease forwards",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "880px",
          background: "linear-gradient(145deg, #0d1527 0%, #0b1120 50%, #111e38 100%)",
          color: "#f8fafc",
          borderRadius: "20px",
          border: "1.5px solid rgba(59, 130, 246, 0.4)",
          boxShadow: "0 25px 60px -15px rgba(37, 99, 235, 0.5), 0 0 35px rgba(37, 99, 235, 0.25)",
          overflow: "hidden",
          animation: "advertModalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated Top Flash Accent Bar */}
        <div
          style={{
            height: "5px",
            width: "100%",
            background: "linear-gradient(90deg, #2563eb, #38bdf8, #f59e0b, #3b82f6, #60a5fa)",
            backgroundSize: "200% 100%",
            animation: "advertGlowShimmer 3s linear infinite",
          }}
        />

        {/* Modal Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(15, 23, 42, 0.6)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                background: "rgba(37, 99, 235, 0.25)",
                border: "1px solid rgba(96, 165, 250, 0.4)",
                borderRadius: "999px",
                padding: "4px 12px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#38bdf8",
                  boxShadow: "0 0 10px #38bdf8",
                  animation: "pulse 1.5s infinite",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "#93c5fd",
                }}
              >
                ⚡ Limited Drop · Official Release
              </span>
            </div>
            <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>
              Official Matchday Edition
            </span>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close modal"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#cbd5e1",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "16px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.color = "#cbd5e1";
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "24px", maxHeight: "calc(86vh - 120px)", overflowY: "auto" }}>
          {/* Headline */}
          <div style={{ marginBottom: "20px", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "22px" }}>⚽</span>
              <h2
                id="advert-title"
                style={{
                  margin: 0,
                  fontSize: "clamp(20px, 3.2vw, 30px)",
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                  background: "linear-gradient(135deg, #ffffff 40%, #93c5fd 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                USDC Kits Available in Store
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: "14px", color: "#94a3b8", lineHeight: 1.5 }}>
              Shop the official club jerseys featuring <strong style={{ color: "#60a5fa" }}>USDC by Circle</strong> sponsorship. Available via customisation options with instant settlement on Arc Blockchain.
            </p>
          </div>

          {/* Main Grid: Left image preview + Right details */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "24px",
              alignItems: "stretch",
            }}
          >
            {/* Left Image Showcase Card */}
            <div
              style={{
                position: "relative",
                background: "#080d1a",
                borderRadius: "16px",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 0 30px rgba(0, 0, 0, 0.8)",
              }}
            >
              {/* Badges on image */}
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  zIndex: 2,
                }}
              >
                <span
                  style={{
                    background: "rgba(37, 99, 235, 0.9)",
                    backdropFilter: "blur(6px)",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: "6px",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                  }}
                >
                  {activeKit.badge || "Official Kit"}
                </span>
                <span
                  style={{
                    background: "rgba(16, 185, 129, 0.9)",
                    backdropFilter: "blur(6px)",
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  ⚡ Arc Blockchain Verified
                </span>
              </div>

              {/* Discount pill */}
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: 800,
                  padding: "4px 8px",
                  borderRadius: "6px",
                  zIndex: 2,
                }}
              >
                SAVE 23%
              </div>

              {/* Main Photo */}
              <div
                style={{
                  width: "100%",
                  height: "360px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "#0a1122",
                }}
                onClick={() => onViewDetail && onViewDetail(activeKit)}
                title="Click to view full kit details"
              >
                <img
                  src={activeKit.img}
                  alt={activeKit.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transition: "transform 0.4s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                />
              </div>

              {/* Bottom Banner as seen on the kits */}
              <div
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.95), #0a1122)",
                  borderTop: "1px solid rgba(59, 130, 246, 0.2)",
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 600,
                    color: "#60a5fa",
                    letterSpacing: "0.2px",
                  }}
                >
                  ℹ️ USDC by Circle available via the customisation options
                </span>
              </div>
            </div>

            {/* Right Information & Actions */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                {/* Kit Title & Price */}
                <div style={{ marginBottom: "14px" }}>
                  <h3
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "#f1f5f9",
                      margin: "0 0 6px",
                      lineHeight: 1.25,
                    }}
                  >
                    {activeKit.name}
                  </h3>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                    <span
                      style={{
                        fontSize: "26px",
                        fontWeight: 800,
                        color: "#38bdf8",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      {activeKit.price} USDC
                    </span>
                    {activeKit.oldPrice && (
                      <span
                        style={{
                          fontSize: "16px",
                          color: "#64748b",
                          textDecoration: "line-through",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {activeKit.oldPrice} USDC
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>
                    {activeKit.desc}
                  </p>
                </div>

                {/* 4 Kit Selection Tabs */}
                <div style={{ marginBottom: "18px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      color: "#94a3b8",
                      marginBottom: "8px",
                    }}
                  >
                    Select Kit Edition ({kits.length || 4} Available)
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "8px",
                    }}
                  >
                    {kits.map((k, idx) => {
                      const isSelected = selectedIndex === idx;
                      return (
                        <button
                          key={k.id || idx}
                          onClick={() => setSelectedIndex(idx)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 10px",
                            borderRadius: "10px",
                            background: isSelected
                              ? "rgba(37, 99, 235, 0.25)"
                              : "rgba(255, 255, 255, 0.04)",
                            border: isSelected
                              ? "1.5px solid #38bdf8"
                              : "1px solid rgba(255, 255, 255, 0.1)",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <img
                            src={k.img}
                            alt=""
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "6px",
                              objectFit: "cover",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: isSelected ? "#38bdf8" : "#e2e8f0",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {idx === 0
                                ? "Home Blue"
                                : idx === 1
                                ? "Away White"
                                : idx === 2
                                ? "Stealth Black"
                                : "Junior & Youth"}
                            </div>
                            <div
                              style={{
                                fontSize: "10px",
                                color: "#94a3b8",
                                fontFamily: "var(--font-mono, monospace)",
                              }}
                            >
                              {k.price} USDC
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Size Selector */}
                <div style={{ marginBottom: "18px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        color: "#94a3b8",
                      }}
                    >
                      Size: <span style={{ color: "#fff" }}>{selectedSize}</span>
                    </label>
                    <span style={{ fontSize: "11px", color: "#60a5fa" }}>Match Standard Fit</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {SIZES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedSize(s)}
                        style={{
                          width: "42px",
                          height: "36px",
                          borderRadius: "8px",
                          border:
                            selectedSize === s
                              ? "2px solid #38bdf8"
                              : "1px solid rgba(255, 255, 255, 0.15)",
                          background:
                            selectedSize === s ? "#2563eb" : "rgba(255, 255, 255, 0.05)",
                          color: selectedSize === s ? "#fff" : "#cbd5e1",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Highlights */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    marginBottom: "20px",
                    fontSize: "11.5px",
                    color: "#94a3b8",
                    display: "flex",
                    flexDirection: "column",
                    gap: "5px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#e2e8f0" }}>
                    <span style={{ color: "#10b981" }}>✓</span>
                    <span>Official USDC by Circle sponsor graphic on front</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#e2e8f0" }}>
                    <span style={{ color: "#10b981" }}>✓</span>
                    <span>Customisation options available (Name & Squad Number)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#e2e8f0" }}>
                    <span style={{ color: "#10b981" }}>✓</span>
                    <span>Instant on-chain checkout with USDC on Arc Blockchain</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={handleAddToCart}
                    style={{
                      flex: 1.5,
                      background: justAdded
                        ? "#10b981"
                        : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "10px",
                      padding: "13px 20px",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      boxShadow: "0 4px 18px rgba(37, 99, 235, 0.4)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {justAdded ? (
                      <>✓ Added to Cart!</>
                    ) : (
                      <>🛒 Add to Cart ({activeKit.price} USDC)</>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      onClose();
                      if (onViewDetail) onViewDetail(activeKit);
                    }}
                    style={{
                      flex: 1,
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      color: "#f8fafc",
                      borderRadius: "10px",
                      padding: "13px 16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
                  >
                    🔍 Details
                  </button>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    if (onNavigateToKits) onNavigateToKits();
                  }}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "1px dashed rgba(59, 130, 246, 0.5)",
                    color: "#60a5fa",
                    borderRadius: "10px",
                    padding: "10px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(37, 99, 235, 0.15)";
                    e.currentTarget.style.borderColor = "#93c5fd";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)";
                  }}
                >
                  ⚽ Browse All Kits in Store Section ↗
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(11, 17, 32, 0.8)",
            fontSize: "11px",
            color: "#64748b",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "#2563eb" }}
            />
            <span>Don't show this again today</span>
          </label>

          <span style={{ color: "#38bdf8", fontWeight: 600 }}>
            ⚡ Powered by Circle USDC & Arc Chain
          </span>
        </div>
      </div>
    </div>
  );
}
