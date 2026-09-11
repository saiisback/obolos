// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ObolosPolicyEnvelope} from "./ObolosPolicyEnvelope.sol";
import {ObolosEconomicLedger} from "./ObolosEconomicLedger.sol";
contract ObolosMarketSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;
    error Invalid(); error Stale();
    address public constant CANONICAL_USDC = 0x3600000000000000000000000000000000000000;
    IERC20 public constant token = IERC20(CANONICAL_USDC);
    ObolosPolicyEnvelope public immutable policy;
    ObolosEconomicLedger public immutable ledger;
    address public immutable reserve;
    address public immutable reviewPool;
    struct Service { address seller; uint8 category; bytes32 unitHash; uint256 quantity; uint256 unitPrice; bytes32 endpointHash; }
    struct Order { bytes32 orderId; bytes32 agentId; uint8 category; address seller; bytes32 serviceHash; bytes32 unitHash; uint256 quantity; uint256 unitPrice; uint256 amount; bytes32 inputHash; uint256 deadline; uint64 policyVersion; uint64 agentVersion; uint64 feeVersion; }
    mapping(bytes32 => Service) public services;
    mapping(bytes32 => bytes32) public orderHashes;
    event ServiceRegistered(bytes32 indexed serviceHash, address indexed seller, uint8 category, bytes32 unitHash, uint256 quantity, uint256 unitPrice, bytes32 endpointHash);
    event OrderSettled(bytes32 indexed orderId, bytes32 indexed orderHash, address indexed payer, uint256 amount, uint256 sellerAmount, uint256 reserveAmount, uint256 reviewAmount, uint256 rebateAmount, uint64 policyVersion, uint64 feeVersion);
    constructor(address policy_, address ledger_, address reserve_, address review_) {
        if(policy_.code.length == 0 || ledger_.code.length == 0 || reserve_ == address(0) || review_ == address(0)) revert Invalid();
        policy = ObolosPolicyEnvelope(policy_); ledger = ObolosEconomicLedger(ledger_); reserve = reserve_; reviewPool = review_;
    }
    function registerService(uint8 category, bytes32 unitHash, uint256 quantity, uint256 unitPrice, bytes32 endpointHash) external returns(bytes32 h) {
        if(category > 4 || unitHash == bytes32(0) || quantity == 0 || unitPrice == 0 || endpointHash == bytes32(0)) revert Invalid();
        h = keccak256(abi.encode(block.chainid, address(this), msg.sender, category, unitHash, quantity, unitPrice, endpointHash));
        if(services[h].seller != address(0)) revert Invalid();
        services[h] = Service(msg.sender, category, unitHash, quantity, unitPrice, endpointHash);
        emit ServiceRegistered(h, msg.sender, category, unitHash, quantity, unitPrice, endpointHash);
    }
    function settle(Order calldata o) external nonReentrant {
        if(o.deadline < block.timestamp || o.feeVersion != policy.feeVersion() || orderHashes[o.orderId] != bytes32(0)) revert Stale();
        Service storage s = services[o.serviceHash];
        if(o.orderId == bytes32(0) || s.seller == address(0) || o.seller != s.seller || o.category != s.category || o.unitHash != s.unitHash || o.quantity != s.quantity || o.unitPrice != s.unitPrice || o.amount != o.quantity * o.unitPrice) revert Invalid();
        if(policy.settlement() != address(this) || ledger.settlement() != address(this)) revert Invalid();
        bytes32 h = keccak256(abi.encode(block.chainid, address(this), msg.sender, o));
        policy.consume(o.orderId, o.agentId, msg.sender, o.category, o.seller, o.amount, o.policyVersion, o.agentVersion);
        orderHashes[o.orderId] = h;
        uint256 r = o.amount * policy.reserveBps() / 10000;
        uint256 v = o.amount * policy.reviewBps() / 10000;
        uint256 sellerAmount = o.amount - r - v; // All rounding dust belongs to the seller.
        token.safeTransferFrom(msg.sender, o.seller, sellerAmount);
        if(r != 0) token.safeTransferFrom(msg.sender, reserve, r);
        if(v != 0) token.safeTransferFrom(msg.sender, reviewPool, v);
        ledger.recordPaid(o.orderId, o.agentId, msg.sender, o.seller, o.serviceHash, o.category, o.unitHash, o.quantity, o.unitPrice, o.amount, o.inputHash);
        emit OrderSettled(o.orderId, h, msg.sender, o.amount, sellerAmount, r, v, 0, o.policyVersion, o.feeVersion);
    }
}
