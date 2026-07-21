// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ── AgenticCommerce Events ──────────────────────────────────────────────────
event JobCreated(
    uint256 indexed jobId,
    address indexed client,
    address indexed provider,
    address evaluator,
    address token,
    uint256 expiredAt,
    string description
);
event JobFunded(uint256 indexed jobId, uint256 amount);
event JobSubmitted(uint256 indexed jobId, bytes32 deliverable);
event JobCompleted(
    uint256 indexed jobId,
    address indexed recipient,
    uint256 amount,
    bytes32 reason
);
event JobRejected(
    uint256 indexed jobId,
    address indexed refundedTo,
    uint256 amount,
    bytes32 reason
);
event JobExpired(
    uint256 indexed jobId,
    address indexed refundedTo,
    uint256 amount
);
event FeeUpdated(uint256 newBps, address newTreasury);
event EvaluatorUpdated(uint256 indexed jobId, address indexed newEvaluator);

// ── MerchantVault Events ────────────────────────────────────────────────────
event PaymentRecorded(
    address indexed buyer,
    bytes32 indexed orderId,
    uint256 amount,
    string productName
);
event OrderShipped(bytes32 indexed orderId, uint256 shippedAt);
event DeliveryConfirmed(
    bytes32 indexed orderId,
    uint256 deliveredAt,
    uint256 returnWindowEnd
);
event OrderDisputed(bytes32 indexed orderId, address indexed disputedBy);
event Settled(
    address indexed recipient,
    bytes32 indexed orderId,
    uint256 amount
);
event BulkSettled(address indexed recipient, uint256 amount);
event Refunded(
    address indexed buyer,
    bytes32 indexed orderId,
    uint256 amount
);
event UsdcTokenUpdated(address indexed oldToken, address indexed newToken);

// ── Shared Events ───────────────────────────────────────────────────────────
event AgentUpdated(address indexed oldAgent, address indexed newAgent);
