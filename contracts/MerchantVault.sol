// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title MerchantVault v2
 * @dev Escrow contract with autonomous lifecycle management.
 *
 * Lifecycle:
 *   1. Agent calls recordAgentPayment() after transferFrom executes on USDC
 *   2. Merchant ships order → calls confirmShipped()
 *   3. Buyer confirms delivery → calls confirmDelivery()  (or merchant after 30 days)
 *   4. After 30-day return window → anyone calls releaseAfterWindow() to settle
 *
 * Roles:
 *   owner  = merchant (receives settled USDC)
 *   agent  = Circle Agent Wallet (can record payments autonomously)
 */
contract MerchantVault {

    // ── State ──────────────────────────────────────────────────────────────────

    address public owner;
    address public agent;
    IERC20  public usdcToken;

    enum OrderStatus { Paid, Shipped, Delivered, Settled, Refunded }

    struct Order {
        address buyer;
        uint256 amount;          // in USDC raw (6 decimals)
        OrderStatus status;
        uint256 paidAt;
        uint256 shippedAt;
        uint256 deliveredAt;
        uint256 returnWindowEnd; // deliveredAt + 30 days
        string  productName;
    }

    mapping(string => Order) public orders;  // orderId → Order
    string[] public orderIds;               // list of all order IDs

    uint256 public constant RETURN_WINDOW = 30 days;

    // ── Events ─────────────────────────────────────────────────────────────────

    event PaymentRecorded(address indexed buyer, string orderId, uint256 amount, string productName);
    event OrderShipped(string orderId, uint256 shippedAt);
    event DeliveryConfirmed(string orderId, uint256 deliveredAt, uint256 returnWindowEnd);
    event Settled(address indexed recipient, string orderId, uint256 amount);
    event Refunded(address indexed buyer, string orderId, uint256 amount);
    event AgentUpdated(address indexed newAgent);

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "Only agent");
        _;
    }

    modifier onlyOwnerOrAgent() {
        require(msg.sender == owner || msg.sender == agent, "Only owner or agent");
        _;
    }

    modifier orderExists(string memory orderId) {
        require(orders[orderId].buyer != address(0), "Order not found");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(address _usdcToken, address _agent) {
        owner     = msg.sender;
        agent     = _agent;
        usdcToken = IERC20(_usdcToken);
    }

    // ── Payment Functions ──────────────────────────────────────────────────────

    /**
     * @notice Standard buyer-initiated payment (buyer signs the tx).
     * @dev Buyer must approve(vaultAddress, amount) on USDC first.
     */
    function pay(
        uint256 amount,
        string memory orderId,
        string memory productName
    ) external {
        require(amount > 0, "Amount must be > 0");
        require(orders[orderId].buyer == address(0), "Order ID already used");

        bool ok = usdcToken.transferFrom(msg.sender, address(this), amount);
        require(ok, "USDC transferFrom failed");

        _recordOrder(msg.sender, orderId, amount, productName);
    }

    /**
     * @notice Record a payment that the agent already executed via transferFrom.
     * @dev Called by the Circle Agent Wallet after it calls USDC.transferFrom()
     *      autonomously. The vault has already received the USDC.
     * @param buyer       The user's wallet address.
     * @param orderId     Unique order identifier.
     * @param amount      Raw USDC amount (6 decimals).
     * @param productName Human-readable product name for records.
     */
    function recordAgentPayment(
        address buyer,
        string memory orderId,
        uint256 amount,
        string memory productName
    ) external onlyAgent {
        require(amount > 0, "Amount must be > 0");
        require(orders[orderId].buyer == address(0), "Order ID already used");
        // USDC already transferred by the agent's transferFrom — just record it
        _recordOrder(buyer, orderId, amount, productName);
    }

    // ── Order Lifecycle ────────────────────────────────────────────────────────

    /**
     * @notice Merchant confirms the order has been shipped.
     */
    function confirmShipped(string memory orderId)
        external
        onlyOwnerOrAgent
        orderExists(orderId)
    {
        Order storage o = orders[orderId];
        require(o.status == OrderStatus.Paid, "Order must be in Paid state");
        o.status    = OrderStatus.Shipped;
        o.shippedAt = block.timestamp;
        emit OrderShipped(orderId, block.timestamp);
    }

    /**
     * @notice Buyer or merchant confirms delivery.
     *         Starts the 30-day return window.
     */
    function confirmDelivery(string memory orderId)
        external
        orderExists(orderId)
    {
        Order storage o = orders[orderId];
        require(
            msg.sender == o.buyer || msg.sender == owner || msg.sender == agent,
            "Not authorized"
        );
        require(o.status == OrderStatus.Shipped, "Order must be Shipped");

        o.status          = OrderStatus.Delivered;
        o.deliveredAt     = block.timestamp;
        o.returnWindowEnd = block.timestamp + RETURN_WINDOW;

        emit DeliveryConfirmed(orderId, block.timestamp, o.returnWindowEnd);
    }

    /**
     * @notice Release funds to merchant after the 30-day return window expires.
     *         Anyone can call this — it's permissionless once the window is up.
     */
    function releaseAfterWindow(string memory orderId)
        external
        orderExists(orderId)
    {
        Order storage o = orders[orderId];
        require(o.status == OrderStatus.Delivered, "Not yet delivered");
        require(block.timestamp >= o.returnWindowEnd, "Return window still open");

        o.status = OrderStatus.Settled;
        bool ok  = usdcToken.transfer(owner, o.amount);
        require(ok, "USDC transfer failed");

        emit Settled(owner, orderId, o.amount);
    }

    /**
     * @notice Merchant manually settles a specific order (skips window check).
     */
    function settleOrder(string memory orderId, address to)
        external
        onlyOwner
        orderExists(orderId)
    {
        Order storage o = orders[orderId];
        require(
            o.status == OrderStatus.Paid ||
            o.status == OrderStatus.Shipped ||
            o.status == OrderStatus.Delivered,
            "Order already settled or refunded"
        );
        o.status = OrderStatus.Settled;
        bool ok  = usdcToken.transfer(to, o.amount);
        require(ok, "USDC transfer failed");
        emit Settled(to, orderId, o.amount);
    }

    /**
     * @notice Refund a specific order back to the buyer.
     */
    function refundOrder(string memory orderId)
        external
        onlyOwner
        orderExists(orderId)
    {
        Order storage o = orders[orderId];
        require(o.status != OrderStatus.Settled, "Already settled");
        require(o.status != OrderStatus.Refunded, "Already refunded");

        o.status = OrderStatus.Refunded;
        bool ok  = usdcToken.transfer(o.buyer, o.amount);
        require(ok, "USDC refund failed");
        emit Refunded(o.buyer, orderId, o.amount);
    }

    // ── Bulk Settlement ────────────────────────────────────────────────────────

    /**
     * @notice Withdraw all unsettled USDC balance to a recipient.
     */
    function settleAll(address to) external onlyOwner {
        uint256 bal = usdcToken.balanceOf(address(this));
        require(bal > 0, "No funds to settle");
        bool ok = usdcToken.transfer(to, bal);
        require(ok, "USDC transfer failed");
        emit Settled(to, "bulk", bal);
    }

    // ── View Functions ─────────────────────────────────────────────────────────

    /**
     * @notice Get full order details by orderId.
     */
    function getOrder(string memory orderId)
        external
        view
        returns (Order memory)
    {
        return orders[orderId];
    }

    /**
     * @notice Get the total number of recorded orders.
     */
    function totalOrders() external view returns (uint256) {
        return orderIds.length;
    }

    /**
     * @notice Get current vault USDC balance.
     */
    function vaultBalance() external view returns (uint256) {
        return usdcToken.balanceOf(address(this));
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    /**
     * @notice Update the agent wallet address (e.g., when Circle wallet rotates).
     */
    function setAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "Zero address");
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    /**
     * @notice Transfer vault ownership to a new merchant address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    function _recordOrder(
        address buyer,
        string memory orderId,
        uint256 amount,
        string memory productName
    ) internal {
        orders[orderId] = Order({
            buyer:           buyer,
            amount:          amount,
            status:          OrderStatus.Paid,
            paidAt:          block.timestamp,
            shippedAt:       0,
            deliveredAt:     0,
            returnWindowEnd: 0,
            productName:     productName
        });
        orderIds.push(orderId);
        emit PaymentRecorded(buyer, orderId, amount, productName);
    }
}
