// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Buyer owners alone grant debit mandates; platform policy can only constrain them.
contract ObolosPolicyEnvelope is EIP712 {
    error Unauthorized(); error Invalid(); error Limit(); error Paused(); error Stale();
    address public immutable controller;
    address public immutable approver;
    address public immutable guardian;
    address public settlement;
    bool public marketEnabled = true;
    uint64 public policyVersion = 1;
    uint256 public approvalNonce;
    uint16 public reserveBps = 300;
    uint16 public reviewBps = 200;
    uint64 public feeVersion = 1;
    uint16 public constant MAX_FEE_BPS = 1000;
    struct Category { bool enabled; uint256 perOrderCap; uint256 windowCap; uint64 windowSeconds; uint64 delaySeconds; }
    struct Window { uint256 start; uint256 spent; uint256 last; }
    struct Agent { address owner; address executor; bool active; uint256 totalCap; uint256 spent; uint256 windowCap; uint64 windowSeconds; }
    mapping(uint8 => Category) public categories;
    mapping(uint8 => Window) public categoryWindows;
    mapping(bytes32 => Agent) public agents;
    mapping(address => address) public executorOwners;
    mapping(bytes32 => uint64) public agentVersions;
    mapping(bytes32 => Window) public agentWindows;
    mapping(bytes32 => mapping(uint8 => mapping(address => bool))) public counterparties;
    mapping(bytes32 => bool) public consumed;
    bytes32 private constant APPROVAL = keccak256("PolicyApproval(bytes32 actionHash,bytes32 observationHash,uint256 nonce,uint256 deadline)");
    event PolicyChanged(uint64 indexed version, bytes32 indexed actionHash, bytes32 indexed observationHash, address actor, bytes32 approvalDigest);
    event ExecutorBound(address indexed executor, address indexed owner);
    event AgentRegistered(bytes32 indexed agentId, address indexed owner, address executor);
    event OrderConsumed(bytes32 indexed orderId, bytes32 indexed agentId, uint8 category, uint256 amount);
    constructor(address controller_, address approver_, address guardian_) EIP712("ObolosPolicyEnvelope", "1") {
        if(controller_ == address(0) || approver_ == address(0) || guardian_ == address(0)) revert Invalid();
        controller = controller_; approver = approver_; guardian = guardian_;
    }
    function wireSettlement(address target) external {
        if(msg.sender != controller) revert Unauthorized();
        if(settlement != address(0) || target.code.length == 0) revert Invalid();
        settlement = target;
    }
    function approvalDigest(bytes32 action, bytes32 observation, uint256 nonce, uint256 deadline) public view returns(bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(APPROVAL, action, observation, nonce, deadline)));
    }
    function _approve(bytes32 action, bytes32 observation, uint256 deadline, bytes calldata signature) private {
        if(msg.sender != controller) revert Unauthorized();
        if(block.timestamp > deadline) revert Stale();
        bytes32 digest = approvalDigest(action, observation, approvalNonce, deadline);
        if(ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), signature) != approver) revert Unauthorized();
        approvalNonce++; policyVersion++;
        emit PolicyChanged(policyVersion, action, observation, msg.sender, digest);
    }
    function setCategory(uint8 id, Category calldata value, bytes32 observation, uint256 deadline, bytes calldata signature) external {
        if(id > 4 || value.windowSeconds == 0) revert Invalid();
        _approve(keccak256(abi.encode("CATEGORY", id, value)), observation, deadline, signature);
        categories[id] = value; // Preserve spending across policy edits: changes cannot erase history.
    }
    function setFees(uint16 reserve, uint16 review, bytes32 observation, uint256 deadline, bytes calldata signature) external {
        if(uint256(reserve) + review > MAX_FEE_BPS) revert Limit();
        _approve(keccak256(abi.encode("FEES", reserve, review)), observation, deadline, signature);
        reserveBps = reserve; reviewBps = review; feeVersion++;
    }
    function resume(bytes32 observation, uint256 deadline, bytes calldata signature) external {
        _approve(keccak256(abi.encode("RESUME")), observation, deadline, signature); marketEnabled = true;
    }
    function emergencyPause(bytes32 reason) external {
        if(msg.sender != guardian && msg.sender != controller) revert Unauthorized();
        marketEnabled = false; policyVersion++; approvalNonce++;
        emit PolicyChanged(policyVersion, keccak256("PAUSE"), reason, msg.sender, bytes32(0));
    }
    /// @notice One-time human-approved enrollment prevents alternate IDs escaping owner caps.
    function bindExecutor(address executor, address owner, bytes32 observation, uint256 deadline, bytes calldata signature) external {
        if(executor == address(0) || owner == address(0) || executorOwners[executor] != address(0)) revert Invalid();
        _approve(keccak256(abi.encode("EXECUTOR_OWNER", executor, owner)), observation, deadline, signature);
        executorOwners[executor] = owner; emit ExecutorBound(executor, owner);
    }
    function registerAgent(bytes32 id, address executor, uint256 totalCap, uint256 windowCap, uint64 windowSeconds) external {
        if(executorOwners[executor] != msg.sender) revert Unauthorized();
        if(id == bytes32(0) || agents[id].owner != address(0) || executor == address(0) || windowSeconds == 0) revert Invalid();
        agents[id] = Agent(msg.sender, executor, true, totalCap, 0, windowCap, windowSeconds);
        agentVersions[id] = 1; emit AgentRegistered(id, msg.sender, executor);
    }
    function setAgent(bytes32 id, address executor, bool active, uint256 totalCap, uint256 windowCap, uint64 windowSeconds) external {
        Agent storage a = agents[id];
        if(msg.sender != a.owner) revert Unauthorized();
        if(executorOwners[executor] != a.owner) revert Unauthorized();
        if(executor == address(0) || windowSeconds == 0 || totalCap < a.spent) revert Invalid();
        a.executor = executor; a.active = active; a.totalCap = totalCap; a.windowCap = windowCap; a.windowSeconds = windowSeconds;
        agentVersions[id]++; emit PolicyChanged(policyVersion, keccak256(abi.encode("AGENT", id, executor, active, totalCap, windowCap, windowSeconds)), 0, msg.sender, 0);
    }
    function setCounterparty(bytes32 id, uint8 category, address seller, bool allowed) external {
        if(msg.sender != agents[id].owner) revert Unauthorized();
        if(category > 4 || seller == address(0)) revert Invalid();
        counterparties[id][category][seller] = allowed; agentVersions[id]++;
        emit PolicyChanged(policyVersion, keccak256(abi.encode("SELLER", id, category, seller, allowed)), 0, msg.sender, 0);
    }
    function _consumeWindow(Window storage w, uint256 amount, uint256 cap, uint64 seconds_, uint64 delay_) private {
        if(w.last != 0 && block.timestamp < w.last + delay_) revert Limit();
        if(w.start == 0 || block.timestamp >= w.start + seconds_) { w.start = block.timestamp; w.spent = 0; }
        if(w.spent + amount > cap) revert Limit();
        w.spent += amount; w.last = block.timestamp;
    }
    function consume(bytes32 orderId, bytes32 agentId, address executor, uint8 category, address seller, uint256 amount, uint64 version, uint64 agentVersion) external {
        if(msg.sender != settlement) revert Unauthorized();
        if(!marketEnabled) revert Paused();
        if(version != policyVersion || agentVersion != agentVersions[agentId] || consumed[orderId]) revert Stale();
        Agent storage a = agents[agentId]; Category storage c = categories[category];
        if(executorOwners[executor] != a.owner || executor != a.executor || !a.active || !counterparties[agentId][category][seller]) revert Unauthorized();
        if(!c.enabled || amount == 0 || amount > c.perOrderCap || a.spent + amount > a.totalCap) revert Limit();
        _consumeWindow(agentWindows[agentId], amount, a.windowCap, a.windowSeconds, c.delaySeconds);
        _consumeWindow(categoryWindows[category], amount, c.windowCap, c.windowSeconds, c.delaySeconds);
        a.spent += amount; consumed[orderId] = true;
        emit OrderConsumed(orderId, agentId, category, amount);
    }
}
