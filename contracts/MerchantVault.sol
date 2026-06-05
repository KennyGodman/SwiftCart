// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title MerchantVault
 * @dev A simple smart contract that acts as a settlement vault/escrow for merchant payments.
 * It holds USDC payments from buyers before they are settled (withdrawn) by the merchant.
 */
contract MerchantVault {
    address public owner;
    IERC20 public usdcToken;
    
    event PaymentReceived(address indexed buyer, string orderId, uint256 amount);
    event Settled(address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor(address _usdcToken) {
        owner = msg.sender;
        usdcToken = IERC20(_usdcToken);
    }

    /**
     * @notice Pay USDC into the vault for a specific order.
     * @dev Buyer must first call `approve(vaultAddress, amount)` on the USDC contract.
     * @param amount The amount of USDC to deposit (6 decimals).
     * @param orderId A unique identifier for the order/checkout.
     */
    function pay(uint256 amount, string memory orderId) external {
        require(amount > 0, "Amount must be greater than 0");
        
        bool success = usdcToken.transferFrom(msg.sender, address(this), amount);
        require(success, "USDC payment failed");
        
        emit PaymentReceived(msg.sender, orderId, amount);
    }

    /**
     * @notice Withdraw funds from the vault to a recipient (settlement).
     * @param to The address receiving the settled funds.
     * @param amount The amount of USDC to withdraw.
     */
    function settle(address to, uint256 amount) external onlyOwner {
        uint256 balance = usdcToken.balanceOf(address(this));
        require(amount <= balance, "Insufficient balance in vault");
        
        bool success = usdcToken.transfer(to, amount);
        require(success, "Settlement transfer failed");
        
        emit Settled(to, amount);
    }

    /**
     * @notice Withdraw all available funds in the vault.
     * @param to The address receiving all settled funds.
     */
    function settleAll(address to) external onlyOwner {
        uint256 balance = usdcToken.balanceOf(address(this));
        require(balance > 0, "No funds to settle");
        
        bool success = usdcToken.transfer(to, balance);
        require(success, "Settlement transfer failed");
        
        emit Settled(to, balance);
    }

    /**
     * @notice Transfer ownership of the vault to a new merchant address.
     * @param newOwner The new merchant owner address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
    }
}
