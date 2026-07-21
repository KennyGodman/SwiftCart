// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerce} from "../contracts/AgenticCommerce.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {
    AgenticCommerce__ZeroAddress,
    AgenticCommerce__ZeroAgent,
    AgenticCommerce__ZeroBudget,
    AgenticCommerce__ExpiryInPast,
    AgenticCommerce__EmptyDescription,
    AgenticCommerce__NotAuthorized,
    AgenticCommerce__BudgetMismatch,
    AgenticCommerce__BudgetExceedsMax,
    AgenticCommerce__ExpiryNotReached,
    AgenticCommerce__ZeroTreasuryWithFee,
    AgenticCommerce__JobTerminal
} from "../contracts/SwiftCartErrors.sol";
import {JobStatus, Job} from "../contracts/SwiftCartTypes.sol";

contract AgenticCommerceTest is Test {
    AgenticCommerce public commerce;
    MockERC20 public usdc;

    address public owner = address(0x1);
    address public agent = address(0x2);
    address public client = address(0x3);
    address public provider = address(0x4);
    address public evaluator = address(0x5);
    address public treasury = address(0x6);
    address public other = address(0x7);

    uint256 public constant DECIMALS = 1e6;
    uint256 public constant BUDGET = 500 * DECIMALS; // $500
    uint256 public expiredAt;

    function setUp() public {
        expiredAt = block.timestamp + 7 days;

        vm.startPrank(owner);
        usdc = new MockERC20("USD Coin", "USDC");
        commerce = new AgenticCommerce(agent);
        vm.stopPrank();

        usdc.mint(client, 1000 * DECIMALS);
        
        vm.prank(client);
        usdc.approve(address(commerce), type(uint256).max);
    }

    // Constructor Tests
    function testConstructor() public view {
        assertEq(commerce.agent(), agent);
        assertEq(commerce.owner(), owner);
        assertEq(commerce.treasury(), owner);
        assertEq(commerce.platformFeeBps(), 0);
    }

    function testConstructorRevertsOnZeroAgent() public {
        vm.expectRevert(AgenticCommerce__ZeroAgent.selector);
        new AgenticCommerce(address(0));
    }

    // Create Job Tests
    function testCreateJobSuccessAgent() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(
            client,
            provider,
            evaluator,
            address(usdc),
            BUDGET,
            expiredAt,
            "Job 1"
        );

        assertEq(jobId, 1);
        assertEq(commerce.totalJobs(), 1);

        Job memory j = commerce.getJob(jobId);
        assertEq(j.client, client);
        assertEq(j.provider, provider);
        assertEq(j.evaluator, evaluator);
        assertEq(j.token, address(usdc));
        assertEq(j.budget, BUDGET);
        assertEq(j.expiredAt, expiredAt);
        assertEq(uint(j.status), uint(JobStatus.Open));
    }

    function testCreateJobSuccessOwner() public {
        vm.prank(owner);
        uint256 jobId = commerce.createJob(
            client,
            provider,
            evaluator,
            address(usdc),
            BUDGET,
            expiredAt,
            "Job 1"
        );
        assertEq(jobId, 1);
    }

    // Modifier Tests
    function testCreateJobRevertsIfNotAgentOrOwner() public {
        vm.prank(other);
        vm.expectRevert(AgenticCommerce__NotAuthorized.selector);
        commerce.createJob(
            client,
            provider,
            evaluator,
            address(usdc),
            BUDGET,
            expiredAt,
            "Job 1"
        );
    }

    function testCreateJobValidationReverts() public {
        vm.startPrank(agent);

        // Zero client
        vm.expectRevert(AgenticCommerce__ZeroAddress.selector);
        commerce.createJob(address(0), provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        // Zero provider
        vm.expectRevert(AgenticCommerce__ZeroAddress.selector);
        commerce.createJob(client, address(0), evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        // Zero evaluator
        vm.expectRevert(AgenticCommerce__ZeroAddress.selector);
        commerce.createJob(client, provider, address(0), address(usdc), BUDGET, expiredAt, "Job 1");

        // Zero token
        vm.expectRevert(AgenticCommerce__ZeroAddress.selector);
        commerce.createJob(client, provider, evaluator, address(0), BUDGET, expiredAt, "Job 1");

        // Zero budget
        vm.expectRevert(AgenticCommerce__ZeroBudget.selector);
        commerce.createJob(client, provider, evaluator, address(usdc), 0, expiredAt, "Job 1");

        // Past expiry
        vm.expectRevert(AgenticCommerce__ExpiryInPast.selector);
        commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, block.timestamp, "Job 1");

        // Empty description
        vm.expectRevert(AgenticCommerce__EmptyDescription.selector);
        commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "");

        // Budget exceeds max budget
        uint256 hugeBudget = commerce.MAX_BUDGET() + 1;
        vm.expectRevert(abi.encodeWithSelector(
            AgenticCommerce__BudgetExceedsMax.selector,
            hugeBudget,
            commerce.MAX_BUDGET()
        ));
        commerce.createJob(client, provider, evaluator, address(usdc), hugeBudget, expiredAt, "Job 1");

        vm.stopPrank();
    }

    // Funding Tests
    function testFundOnBehalfSuccess() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.prank(agent);
        commerce.fundOnBehalf(jobId, client, BUDGET);

        Job memory j = commerce.getJob(jobId);
        assertEq(uint(j.status), uint(JobStatus.Funded));
        assertEq(usdc.balanceOf(client), clientBalBefore - BUDGET);
        assertEq(usdc.balanceOf(address(commerce)), BUDGET);
        assertEq(commerce.escrowBalance(address(usdc)), BUDGET);
    }

    function testFundOnBehalfRevertsOnClientMismatch() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(agent);
        vm.expectRevert(AgenticCommerce__NotAuthorized.selector);
        commerce.fundOnBehalf(jobId, other, BUDGET);
    }

    function testFundOnBehalfRevertsOnBudgetMismatch() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(
            AgenticCommerce__BudgetMismatch.selector,
            BUDGET + 1,
            BUDGET
        ));
        commerce.fundOnBehalf(jobId, client, BUDGET + 1);
    }

    function testFundSuccess() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        Job memory j = commerce.getJob(jobId);
        assertEq(uint(j.status), uint(JobStatus.Funded));
    }

    // Submit Tests
    function testSubmitSuccess() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        bytes32 deliverable = keccak256("tracking_url");
        
        vm.prank(provider);
        commerce.submit(jobId, deliverable);

        Job memory j = commerce.getJob(jobId);
        assertEq(uint(j.status), uint(JobStatus.Submitted));
        assertEq(j.deliverable, deliverable);
    }

    function testSubmitRevertsIfNotAuthorized() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        vm.prank(other);
        vm.expectRevert(AgenticCommerce__NotAuthorized.selector);
        commerce.submit(jobId, keccak256("tracking_url"));
    }

    // Complete Tests
    function testCompleteSuccessWithoutFees() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        vm.prank(provider);
        commerce.submit(jobId, keccak256("tracking_url"));

        uint256 providerBalBefore = usdc.balanceOf(provider);

        vm.prank(evaluator);
        commerce.complete(jobId, keccak256("success"));

        Job memory j = commerce.getJob(jobId);
        assertEq(uint(j.status), uint(JobStatus.Completed));
        assertEq(j.completionReason, keccak256("success"));
        assertEq(j.completedAt, block.timestamp);
        assertEq(usdc.balanceOf(provider), providerBalBefore + BUDGET);
    }

    function testCompleteSuccessWithFees() public {
        vm.prank(owner);
        commerce.setFee(100, treasury); // 1.00% fee (100 bps)

        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        vm.prank(provider);
        commerce.submit(jobId, keccak256("tracking_url"));

        uint256 providerBalBefore = usdc.balanceOf(provider);
        uint256 treasuryBalBefore = usdc.balanceOf(treasury);

        vm.prank(evaluator);
        commerce.complete(jobId, keccak256("success"));

        uint256 expectedFee = (BUDGET * 100) / 10_000; // $5
        uint256 expectedPayout = BUDGET - expectedFee; // $495

        Job memory j = commerce.getJob(jobId);
        assertEq(uint(j.status), uint(JobStatus.Completed));
        assertEq(usdc.balanceOf(provider), providerBalBefore + expectedPayout);
        assertEq(usdc.balanceOf(treasury), treasuryBalBefore + expectedFee);
    }

    // Reject Tests
    function testRejectSuccess() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        uint256 clientBalBefore = usdc.balanceOf(client);

        vm.prank(evaluator);
        commerce.reject(jobId, keccak256("dispute_resolution"));

        Job memory j = commerce.getJob(jobId);
        assertEq(uint(j.status), uint(JobStatus.Rejected));
        assertEq(j.completionReason, keccak256("dispute_resolution"));
        assertEq(j.rejectedAt, block.timestamp);
        assertEq(usdc.balanceOf(client), clientBalBefore + BUDGET);
    }

    // Claim Refund Tests
    function testClaimRefundSuccess() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        // Warp past expiredAt
        vm.warp(expiredAt + 1);

        uint256 clientBalBefore = usdc.balanceOf(client);

        // Permissionless
        vm.prank(other);
        commerce.claimRefund(jobId);

        Job memory j = commerce.getJob(jobId);
        assertEq(uint(j.status), uint(JobStatus.Expired));
        assertEq(j.claimedAt, block.timestamp);
        assertEq(usdc.balanceOf(client), clientBalBefore + BUDGET);
    }

    function testClaimRefundRevertsIfExpiryNotReached() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(
            AgenticCommerce__ExpiryNotReached.selector,
            jobId
        ));
        commerce.claimRefund(jobId);
    }

    // Admin & Emergency Tests
    function testSetAgentSuccess() public {
        address newAgent = address(0x99);
        vm.prank(owner);
        commerce.setAgent(newAgent);
        assertEq(commerce.agent(), newAgent);
    }

    // Validation checks
    function testSetFeeValidation() public {
        vm.startPrank(owner);

        // Max fee is 500 bps (5%)
        vm.expectRevert("ACP: max 5% fee");
        commerce.setFee(501, treasury);

        // If bps > 0, treasury cannot be address(0)
        vm.expectRevert(AgenticCommerce__ZeroTreasuryWithFee.selector);
        commerce.setFee(100, address(0));

        // Bps = 0 with address(0) is fine
        commerce.setFee(0, address(0));
        assertEq(commerce.platformFeeBps(), 0);
        assertEq(commerce.treasury(), address(0));

        vm.stopPrank();
    }

    // Evaluator Tests
    function testSetJobEvaluatorSuccess() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        address newEvaluator = address(0x88);
        vm.prank(owner);
        commerce.setJobEvaluator(jobId, newEvaluator);

        Job memory j = commerce.getJob(jobId);
        assertEq(j.evaluator, newEvaluator);
    }

    function testSetJobEvaluatorRevertsIfJobTerminal() public {
        vm.prank(agent);
        uint256 jobId = commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");

        vm.prank(client);
        commerce.fund(jobId, BUDGET);

        vm.prank(provider);
        commerce.submit(jobId, keccak256("tracking_url"));

        vm.prank(evaluator);
        commerce.complete(jobId, keccak256("success"));

        // Now job is Completed (terminal)
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(
            AgenticCommerce__JobTerminal.selector,
            jobId
        ));
        commerce.setJobEvaluator(jobId, address(0x88));
    }

    function testPausingBlocksMutations() public {
        vm.prank(owner);
        commerce.pause();

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        commerce.createJob(client, provider, evaluator, address(usdc), BUDGET, expiredAt, "Job 1");
    }
}
