// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ── MerchantVault Types ─────────────────────────────────────────────────────
enum OrderStatus {
    Paid,       // Funds locked; awaiting shipment.
    Shipped,    // Merchant confirmed dispatch.
    Delivered,  // Delivery confirmed; return window running.
    Disputed,   // Dispute raised; settlement frozen pending owner resolution.
    Settled,    // Funds released to merchant. Terminal.
    Refunded    // Funds returned to buyer. Terminal.
}

struct Order {
    address buyer;           ///< Wallet that funded the order.
    uint256 amount;          ///< Raw USDC (6 decimals) held in escrow.
    OrderStatus status;
    uint256 paidAt;          ///< Timestamp of payment.
    uint256 shippedAt;       ///< Timestamp of shipment confirmation.
    uint256 deliveredAt;     ///< Timestamp of delivery confirmation.
    uint256 returnWindowEnd; ///< deliveredAt + RETURN_WINDOW.
    uint256 settledAt;       ///< Timestamp of settlement (0 if not settled).
    uint256 refundedAt;      ///< Timestamp of refund (0 if not refunded).
    string productName;     ///< Human-readable product description.
}

// ── AgenticCommerce Types ───────────────────────────────────────────────────
enum JobStatus {
    Open,       ///< Created, awaiting funding.
    Funded,     ///< USDC pulled into escrow.
    Submitted,  ///< Work submitted; awaiting evaluation.
    Completed,  ///< USDC released to provider. Terminal.
    Rejected,   ///< USDC refunded to client. Terminal.
    Expired     ///< Expiry elapsed; USDC refunded to client. Terminal.
}

struct Job {
    address client;           ///< Buyer wallet that funds the escrow.
    address provider;         ///< Merchant wallet (receives USDC on Completed).
    address evaluator;        ///< ArcWear backend or agent (calls complete/reject).
    address token;            ///< USDC token contract address on Arc.
    uint256 budget;           ///< USDC held in escrow (6-decimal raw units).
    uint256 expiredAt;        ///< Unix timestamp after which claimRefund() works.
    JobStatus status;
    bytes32 deliverable;      ///< keccak256 of order ID / tracking ref (set by submit).
    bytes32 completionReason; ///< Optional audit hash set by evaluator at terminal state.
    uint256 completedAt;      ///< Block timestamp of completion. 0 if not completed.
    uint256 rejectedAt;       ///< Block timestamp of rejection. 0 if not rejected.
    uint256 claimedAt;        ///< Block timestamp of expiry claim. 0 if not claimed.
}
