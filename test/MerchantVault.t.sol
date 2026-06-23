// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MerchantVault} from "../contracts/MerchantVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {
    MerchantVault__ZeroAddress,
    MerchantVault__ZeroAmount,
    MerchantVault__EmptyOrderId,
    MerchantVault__ExceedsMaxAmount,
    MerchantVault__OrderAlreadyUsed,
    MerchantVault__NotAuthorized,
    MerchantVault__InvalidStatus,
    MerchantVault__UsdcNotReceived,
    MerchantVault__NoSurplus,
    MerchantVault__ReturnWindowOpen,
    MerchantVault__TooEarlyForNonBuyer,
    MerchantVault__ActiveEscrowsExist
} from "../contracts/ArcWearErrors.sol";
import {
    OrderStatus,
    Order
} from "../contracts/ArcWearTypes.sol";

contract MerchantVaultTest is Test {
    MerchantVault public vault;
    MockERC20 public usdc;

    address public owner = address(0x1);
    address public agent = address(0x2);
    address public buyer = address(0x3);
    address public treasury = address(0x4);
    address public other = address(0x5);

    bytes32 public orderId1 = keccak256("order_1");
    bytes32 public orderId2 = keccak256("order_2");

    uint256 public constant DECIMALS = 1e6;
    uint256 public constant ORDER_AMOUNT = 100 * DECIMALS; // $100

    function setUp() public {
        vm.startPrank(owner);
        usdc = new MockERC20("USD Coin", "USDC");
        vault = new MerchantVault(address(usdc), agent);
        vm.stopPrank();

        usdc.mint(buyer, 1000 * DECIMALS);
        usdc.mint(agent, 1000 * DECIMALS); // Agent might have funds to pay or simulate

        vm.prank(buyer);
        usdc.approve(address(vault), type(uint256).max);
    }

    // Constructor Tests
    function testConstructor() public view {
        assertEq(address(vault.usdcToken()), address(usdc));
        assertEq(vault.agent(), agent);
        assertEq(vault.owner(), owner);
    }

    // Zero Address
    function testConstructorRevertsOnZeroAddress() public {
        vm.expectRevert(MerchantVault__ZeroAddress.selector);
        new MerchantVault(address(0), agent);

        vm.expectRevert(MerchantVault__ZeroAddress.selector);
        new MerchantVault(address(usdc), address(0));
    }

    // Pay Tests
    function testPaySuccess() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        Order memory o = vault.getOrder(orderId1);
        assertEq(o.buyer, buyer);
        assertEq(o.amount, ORDER_AMOUNT);
        assertEq(uint(o.status), uint(OrderStatus.Paid));
        assertEq(o.paidAt, block.timestamp);
        assertEq(vault.activeEscrowBalance(), ORDER_AMOUNT);
        assertEq(usdc.balanceOf(address(vault)), ORDER_AMOUNT);
    }

    function testPayRevertsOnZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(MerchantVault__ZeroAmount.selector);
        vault.pay(0, orderId1, "Product 1");
    }

    function testPayRevertsOnEmptyOrderId() public {
        vm.prank(buyer);
        vm.expectRevert(MerchantVault__EmptyOrderId.selector);
        vault.pay(ORDER_AMOUNT, bytes32(0), "Product 1");
    }

    // Max Amount Tests
    function testPayRevertsOnExceedsMaxAmount() public {
        uint256 hugeAmount = vault.MAX_ORDER_AMOUNT() + 1;
        usdc.mint(buyer, hugeAmount);

        vm.startPrank(buyer);
        usdc.approve(address(vault), hugeAmount);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerchantVault__ExceedsMaxAmount.selector,
                hugeAmount,
                vault.MAX_ORDER_AMOUNT()
            )
        );
        vault.pay(hugeAmount, orderId1, "Product 1");
        vm.stopPrank();
    }

    function testPayRevertsOnOrderAlreadyUsed() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerchantVault__OrderAlreadyUsed.selector,
                orderId1
            )
        );
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");
    }

    // Agent Payment Tests
    function testRecordAgentPaymentSuccess() public {
        // Simulating the flow: Agent transfers USDC from buyer to vault first
        vm.prank(buyer);
        assertTrue(usdc.transfer(address(vault), ORDER_AMOUNT));

        vm.prank(agent);
        vault.recordAgentPayment(buyer, orderId1, ORDER_AMOUNT, "Product 1");

        Order memory o = vault.getOrder(orderId1);
        assertEq(o.buyer, buyer);
        assertEq(o.amount, ORDER_AMOUNT);
        assertEq(uint(o.status), uint(OrderStatus.Paid));
        assertEq(vault.activeEscrowBalance(), ORDER_AMOUNT);
    }

    function testRecordAgentPaymentRevertsIfNotAgent() public {
        vm.prank(other);
        vm.expectRevert(MerchantVault__NotAuthorized.selector);
        vault.recordAgentPayment(buyer, orderId1, ORDER_AMOUNT, "Product 1");
    }

    function testRecordAgentPaymentRevertsIfZeroBuyer() public {
        vm.prank(agent);
        vm.expectRevert(MerchantVault__ZeroAddress.selector);
        vault.recordAgentPayment(
            address(0),
            orderId1,
            ORDER_AMOUNT,
            "Product 1"
        );
    }

    function testRecordAgentPaymentRevertsIfUsdcNotReceived() public {
        // Agent calls recordAgentPayment without transferring USDC first
        vm.prank(agent);
        vm.expectRevert(MerchantVault__UsdcNotReceived.selector);
        vault.recordAgentPayment(buyer, orderId1, ORDER_AMOUNT, "Product 1");
    }

    // Confirm Shipped Tests
    function testConfirmShippedSuccessOwner() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Shipped));
        assertEq(o.shippedAt, block.timestamp);
    }

    function testConfirmShippedSuccessAgent() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(agent);
        vault.confirmShipped(orderId1);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Shipped));
    }

    function testConfirmShippedRevertsIfNotOwnerOrAgent() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(other);
        vm.expectRevert(MerchantVault__NotAuthorized.selector);
        vault.confirmShipped(orderId1);
    }

    function testConfirmShippedRevertsIfInvalidStatus() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        // Try shipping again
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerchantVault__InvalidStatus.selector,
                orderId1
            )
        );
        vault.confirmShipped(orderId1);
    }

    // Confirm Delivery Tests
    function testConfirmDeliveryBuyerImmediate() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        // Buyer can confirm delivery immediately
        vm.prank(buyer);
        vault.confirmDelivery(orderId1);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Delivered));
        assertEq(o.deliveredAt, block.timestamp);
        assertEq(o.returnWindowEnd, block.timestamp + vault.RETURN_WINDOW());
    }

    function testConfirmDeliveryNonBuyerRevertsTooEarly() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        // Owner/Agent trying to confirm delivery immediately should revert
        vm.prank(owner);
        vm.expectRevert(MerchantVault__TooEarlyForNonBuyer.selector);
        vault.confirmDelivery(orderId1);
    }

    function testConfirmDeliveryNonBuyerSuccessAfterTransitTime() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        // Warp time forward past MINIMUM_TRANSIT_TIME
        vm.warp(block.timestamp + vault.MINIMUM_TRANSIT_TIME() + 1);

        vm.prank(owner);
        vault.confirmDelivery(orderId1);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Delivered));
    }

    // Dispute Order Tests
    function testDisputeOrderSuccess() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        vm.prank(buyer);
        vault.disputeOrder(orderId1);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Disputed));
    }

    // Modifier Tests
    function testDisputeOrderRevertsIfNotAuthorized() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        vm.prank(other);
        vm.expectRevert(MerchantVault__NotAuthorized.selector);
        vault.disputeOrder(orderId1);
    }

    // Release After Window Tests
    function testReleaseAfterWindowSuccess() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        vm.prank(buyer);
        vault.confirmDelivery(orderId1);

        // Warp past RETURN_WINDOW
        vm.warp(block.timestamp + vault.RETURN_WINDOW() + 1);

        uint256 ownerBalBefore = usdc.balanceOf(owner);

        // Permissionless call
        vm.prank(other);
        vault.releaseAfterWindow(orderId1);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Settled));
        assertEq(vault.activeEscrowBalance(), 0);
        assertEq(usdc.balanceOf(owner), ownerBalBefore + ORDER_AMOUNT);
    }

    // Return Window Open Tests
    function testReleaseAfterWindowRevertsIfOpen() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        vm.prank(buyer);
        vault.confirmDelivery(orderId1);

        // Try releasing before window closed
        vm.prank(other);
        vm.expectRevert(MerchantVault__ReturnWindowOpen.selector);
        vault.releaseAfterWindow(orderId1);
    }

    // Settle Order Tests
    function testSettleOrderDisputedSuccess() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vault.confirmShipped(orderId1);

        vm.prank(buyer);
        vault.disputeOrder(orderId1);

        uint256 treasuryBalBefore = usdc.balanceOf(treasury);

        vm.prank(owner);
        vault.settleOrder(orderId1, treasury);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Settled));
        assertEq(usdc.balanceOf(treasury), treasuryBalBefore + ORDER_AMOUNT);
        assertEq(vault.activeEscrowBalance(), 0);
    }

    // Refund Order Tests
    function testRefundOrderSuccess() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        uint256 buyerBalBefore = usdc.balanceOf(buyer);

        vm.prank(owner);
        vault.refundOrder(orderId1);

        Order memory o = vault.getOrder(orderId1);
        assertEq(uint(o.status), uint(OrderStatus.Refunded));
        assertEq(usdc.balanceOf(buyer), buyerBalBefore + ORDER_AMOUNT);
        assertEq(vault.activeEscrowBalance(), 0);
    }

    // Settle All Tests
    function testSettleAllSurplusSuccess() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        // Send direct surplus USDC to the contract (e.g. fee/dust/accidental transfer)
        uint256 surplus = 50 * DECIMALS;
        usdc.mint(address(vault), surplus);

        assertEq(vault.vaultBalance(), ORDER_AMOUNT + surplus);
        assertEq(vault.activeEscrowBalance(), ORDER_AMOUNT);
        assertEq(vault.surplusBalance(), surplus);

        uint256 treasuryBalBefore = usdc.balanceOf(treasury);

        vm.prank(owner);
        vault.settleAll(treasury);

        assertEq(vault.vaultBalance(), ORDER_AMOUNT);
        assertEq(usdc.balanceOf(treasury), treasuryBalBefore + surplus);
    }

    function testSettleAllRevertsIfNoSurplus() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        vm.prank(owner);
        vm.expectRevert(MerchantVault__NoSurplus.selector);
        vault.settleAll(treasury);
    }

    // Admin Tests
    function testSetAgentSuccess() public {
        address newAgent = address(0x99);
        vm.prank(owner);
        vault.setAgent(newAgent);
        assertEq(vault.agent(), newAgent);
    }

    function testSetUsdcTokenSuccess() public {
        MockERC20 newUsdc = new MockERC20("New USD Coin", "nUSDC");
        vm.prank(owner);
        vault.setUsdcToken(address(newUsdc));
        assertEq(address(vault.usdcToken()), address(newUsdc));
    }

    function testSetUsdcTokenRevertsIfActiveEscrows() public {
        vm.prank(buyer);
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");

        MockERC20 newUsdc = new MockERC20("New USD Coin", "nUSDC");
        vm.prank(owner);
        vm.expectRevert(MerchantVault__ActiveEscrowsExist.selector);
        vault.setUsdcToken(address(newUsdc));
    }

    // Pausability Tests
    function testPausingBlocksMutations() public {
        vm.prank(owner);
        vault.pause();

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        vault.pay(ORDER_AMOUNT, orderId1, "Product 1");
    }

    function testSetAgentWorksWhilePaused() public {
        vm.prank(owner);
        vault.pause();

        // setAgent should not revert whenPaused
        vm.prank(owner);
        vault.setAgent(address(0x99));
        assertEq(vault.agent(), address(0x99));
    }
}
