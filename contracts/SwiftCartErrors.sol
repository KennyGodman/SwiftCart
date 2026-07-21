// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ── AgenticCommerce Custom Errors ───────────────────────────────────────────
error AgenticCommerce__ZeroAddress();
error AgenticCommerce__ZeroAgent();
error AgenticCommerce__ZeroBudget();
error AgenticCommerce__ExpiryInPast();
error AgenticCommerce__EmptyDescription();
error AgenticCommerce__JobNotFound(uint256 jobId);
error AgenticCommerce__InvalidStatus(uint256 jobId);
error AgenticCommerce__NotAuthorized();
error AgenticCommerce__BudgetMismatch(uint256 expected, uint256 actual);
error AgenticCommerce__JobExpiredAlready(uint256 jobId);
error AgenticCommerce__ExpiryNotReached(uint256 jobId);
error AgenticCommerce__BudgetExceedsMax(uint256 budget, uint256 max);
error AgenticCommerce__ZeroTreasuryWithFee();
error AgenticCommerce__JobTerminal(uint256 jobId);

// ── MerchantVault Custom Errors ─────────────────────────────────────────────
error MerchantVault__ZeroAddress();
error MerchantVault__ZeroAmount();
error MerchantVault__EmptyOrderId();
error MerchantVault__OrderAlreadyUsed(bytes32 orderId);
error MerchantVault__OrderNotFound(bytes32 orderId);
error MerchantVault__InvalidStatus(bytes32 orderId);
error MerchantVault__NotAuthorized();
error MerchantVault__ExceedsMaxAmount(uint256 amount, uint256 max);
error MerchantVault__UsdcNotReceived();
error MerchantVault__NoSurplus();
error MerchantVault__ReturnWindowOpen();
error MerchantVault__TooEarlyForNonBuyer();
error MerchantVault__ActiveEscrowsExist();
