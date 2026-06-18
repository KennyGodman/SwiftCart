// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AgenticCommerce - ERC-8183 Agentic Commerce Protocol
 * @notice Trustless job escrow for ArcWear agent-initiated orders.
 *
 * Roles (mapped to ArcWear):
 *   client    = buyer wallet (funds the escrow)
 *   provider  = ArcWear merchant wallet (receives USDC on completion)
 *   evaluator = ArcWear backend / Circle agent wallet (triggers complete or reject)
 *   agent     = Circle agent wallet (can create jobs and fund on behalf of client)
 *
 * Lifecycle:
 *   Open -> Funded -> Submitted -> Completed  (USDC -> provider)
 *                              -> Rejected   (USDC -> client)
 *                              -> Expired    (USDC -> client, anyone can trigger)
 *
 * Usage:
 *   1. Buyer approves THIS contract for USDC (not the agent wallet)
 *   2. Agent calls createJob() to open the job
 *   3. Agent calls fundOnBehalf(jobId, buyerAddr, amount) -- pulls USDC into escrow
 *   4. Backend auto-calls submit(jobId, orderHash) -- order is accepted
 *   5. Backend (evaluator) calls complete(jobId) -- USDC released to merchant
 *      OR reject(jobId) on dispute -- USDC refunded to buyer
 *   6. Anyone can call claimRefund(jobId) after expiredAt timestamp
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AgenticCommerce {

    // ---- Enums & Structs ---------------------------------------------------

    enum JobStatus { Open, Funded, Submitted, Completed, Rejected, Expired }

    struct Job {
        address client;          // buyer wallet
        address provider;        // merchant wallet (receives USDC on complete)
        address evaluator;       // ArcWear backend or agent wallet
        address token;           // USDC contract address
        uint256 budget;          // USDC amount in escrow (6-decimal raw units)
        uint256 expiredAt;       // unix timestamp -- after this, claimRefund() works
        JobStatus status;
        bytes32 deliverable;     // keccak256 of order ID submitted by provider/backend
        bytes32 completionReason;
    }

    // ---- State -------------------------------------------------------------

    address public owner;        // contract deployer (ArcWear)
    address public agent;        // Circle agent wallet (authorised to fund on behalf)

    uint256 private _jobCounter;
    mapping(uint256 => Job) public jobs;

    // Optional platform fee (default 0)
    uint256 public platformFeeBps; // basis points e.g. 50 = 0.5%
    address public treasury;       // fee recipient

    // ---- Events ------------------------------------------------------------

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
    event JobCompleted(uint256 indexed jobId, address recipient, uint256 amount, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address refundedTo, uint256 amount, bytes32 reason);
    event JobExpired(uint256 indexed jobId, address refundedTo, uint256 amount);
    event AgentUpdated(address indexed newAgent);
    event FeeUpdated(uint256 newBps, address newTreasury);

    // ---- Modifiers ---------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "ACP: only owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent, "ACP: only agent");
        _;
    }

    modifier onlyAgentOrOwner() {
        require(msg.sender == agent || msg.sender == owner, "ACP: only agent or owner");
        _;
    }

    modifier jobExists(uint256 jobId) {
        require(jobs[jobId].client != address(0), "ACP: job not found");
        _;
    }

    modifier onlyEvaluator(uint256 jobId) {
        require(msg.sender == jobs[jobId].evaluator, "ACP: only evaluator");
        _;
    }

    // ---- Constructor -------------------------------------------------------

    constructor(address _agent) {
        owner = msg.sender;
        agent = _agent;
        treasury = msg.sender;
        platformFeeBps = 0;
    }

    // ---- Job Creation ------------------------------------------------------

    /**
     * @notice Create a new job. Called by the agent on behalf of the buyer.
     * @param client     The buyer's wallet address.
     * @param provider   The merchant wallet (ArcWear merchant address).
     * @param evaluator  The address authorised to complete or reject.
     * @param token      The USDC token address on Arc.
     * @param budget     The USDC amount in raw 6-decimal units.
     * @param expiredAt  Unix timestamp after which claimRefund() is callable.
     * @param description  Human-readable description (order ID or product name).
     * @return jobId The auto-incremented job identifier.
     */
    function createJob(
        address client,
        address provider,
        address evaluator,
        address token,
        uint256 budget,
        uint256 expiredAt,
        string calldata description
    ) external onlyAgentOrOwner returns (uint256 jobId) {
        require(client != address(0),    "ACP: zero client");
        require(provider != address(0),  "ACP: zero provider");
        require(evaluator != address(0), "ACP: zero evaluator");
        require(token != address(0),     "ACP: zero token");
        require(budget > 0,              "ACP: zero budget");
        require(expiredAt > block.timestamp, "ACP: expiry in past");

        _jobCounter++;
        jobId = _jobCounter;

        jobs[jobId] = Job({
            client:           client,
            provider:         provider,
            evaluator:        evaluator,
            token:            token,
            budget:           budget,
            expiredAt:        expiredAt,
            status:           JobStatus.Open,
            deliverable:      bytes32(0),
            completionReason: bytes32(0)
        });

        emit JobCreated(jobId, client, provider, evaluator, token, expiredAt, description);
    }

    // ---- Funding -----------------------------------------------------------

    /**
     * @notice Fund a job by pulling USDC from the client into escrow.
     *         The CLIENT must have approved this contract for at least job.budget USDC.
     *         Called by the Circle agent wallet on behalf of the buyer.
     * @param jobId          The job to fund.
     * @param client         The buyer wallet -- USDC is pulled FROM this address.
     * @param expectedBudget Must match job.budget exactly (prevents front-running).
     */
    function fundOnBehalf(
        uint256 jobId,
        address client,
        uint256 expectedBudget
    ) external onlyAgentOrOwner jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Open,    "ACP: job not Open");
        require(job.client == client,             "ACP: wrong client");
        require(job.budget == expectedBudget,     "ACP: budget mismatch");
        require(block.timestamp < job.expiredAt,  "ACP: job expired");

        job.status = JobStatus.Funded;

        bool ok = IERC20(job.token).transferFrom(client, address(this), job.budget);
        require(ok, "ACP: USDC transferFrom failed");

        emit JobFunded(jobId, job.budget);
    }

    /**
     * @notice Standard ERC-8183 fund() -- client calls directly.
     *         Client must have approved this contract for USDC.
     */
    function fund(uint256 jobId, uint256 expectedBudget) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Open,    "ACP: job not Open");
        require(job.client == msg.sender,         "ACP: only client");
        require(job.budget == expectedBudget,     "ACP: budget mismatch");
        require(block.timestamp < job.expiredAt,  "ACP: job expired");

        job.status = JobStatus.Funded;

        bool ok = IERC20(job.token).transferFrom(msg.sender, address(this), job.budget);
        require(ok, "ACP: USDC transferFrom failed");

        emit JobFunded(jobId, job.budget);
    }

    // ---- Work Submission ---------------------------------------------------

    /**
     * @notice Submit work -- signals the order has been accepted/shipped.
     *         Called by the ArcWear backend right after funding.
     * @param jobId       The funded job.
     * @param deliverable keccak256 hash of the order ID or tracking reference.
     */
    function submit(uint256 jobId, bytes32 deliverable) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(
            msg.sender == job.provider  ||
            msg.sender == job.evaluator ||
            msg.sender == agent         ||
            msg.sender == owner,
            "ACP: not authorised to submit"
        );
        require(job.status == JobStatus.Funded,  "ACP: job must be Funded");
        require(block.timestamp < job.expiredAt, "ACP: job expired");

        job.status      = JobStatus.Submitted;
        job.deliverable = deliverable;

        emit JobSubmitted(jobId, deliverable);
    }

    // ---- Terminal States ---------------------------------------------------

    /**
     * @notice Complete a job -- releases escrowed USDC to the provider (merchant).
     *         Only the evaluator may call this when status is Submitted.
     * @param jobId  The submitted job.
     * @param reason Optional bytes32 reason / audit hash.
     */
    function complete(uint256 jobId, bytes32 reason) external jobExists(jobId) onlyEvaluator(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "ACP: job must be Submitted");

        job.status           = JobStatus.Completed;
        job.completionReason = reason;

        uint256 fee    = (job.budget * platformFeeBps) / 10000;
        uint256 payout = job.budget - fee;

        if (fee > 0 && treasury != address(0)) {
            bool feeOk = IERC20(job.token).transfer(treasury, fee);
            require(feeOk, "ACP: fee transfer failed");
        }

        bool ok = IERC20(job.token).transfer(job.provider, payout);
        require(ok, "ACP: provider transfer failed");

        emit JobCompleted(jobId, job.provider, payout, reason);
    }

    /**
     * @notice Reject a job -- refunds escrowed USDC to the client (buyer).
     *         Evaluator may call this when Funded or Submitted.
     * @param jobId  The job to reject.
     * @param reason Optional bytes32 reason / audit hash.
     */
    function reject(uint256 jobId, bytes32 reason) external jobExists(jobId) onlyEvaluator(jobId) {
        Job storage job = jobs[jobId];
        require(
            job.status == JobStatus.Funded || job.status == JobStatus.Submitted,
            "ACP: cannot reject in current state"
        );

        job.status           = JobStatus.Rejected;
        job.completionReason = reason;

        bool ok = IERC20(job.token).transfer(job.client, job.budget);
        require(ok, "ACP: client refund failed");

        emit JobRejected(jobId, job.client, job.budget, reason);
    }

    /**
     * @notice Claim a refund after the expiry timestamp has passed.
     *         Anyone may call this -- permissionless once expiredAt is reached.
     * @param jobId The expired job.
     */
    function claimRefund(uint256 jobId) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(
            job.status == JobStatus.Funded || job.status == JobStatus.Submitted,
            "ACP: no funds to refund"
        );
        require(block.timestamp >= job.expiredAt, "ACP: expiry not reached");

        job.status = JobStatus.Expired;

        bool ok = IERC20(job.token).transfer(job.client, job.budget);
        require(ok, "ACP: expiry refund failed");

        emit JobExpired(jobId, job.client, job.budget);
    }

    // ---- View Functions ----------------------------------------------------

    /// @notice Return full job details by ID.
    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    /// @notice Total number of jobs ever created.
    function totalJobs() external view returns (uint256) {
        return _jobCounter;
    }

    /// @notice Current USDC balance held by this contract.
    function escrowBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    // ---- Admin -------------------------------------------------------------

    /// @notice Update the authorised Circle agent wallet address.
    function setAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "ACP: zero address");
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    /// @notice Set a platform fee (in basis points) and treasury address.
    function setFee(uint256 bps, address _treasury) external onlyOwner {
        require(bps <= 500, "ACP: max 5% fee");
        require(_treasury != address(0), "ACP: zero treasury");
        platformFeeBps = bps;
        treasury = _treasury;
        emit FeeUpdated(bps, _treasury);
    }

    /// @notice Transfer contract ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ACP: zero address");
        owner = newOwner;
    }
}
