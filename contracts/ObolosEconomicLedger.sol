// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
contract ObolosEconomicLedger {
    error Unauthorized(); error Invalid();
    address public immutable controller;
    address public settlement;
    address public attester;
    struct Paid { address payer; address seller; bytes32 serviceHash; bytes32 inputHash; bytes32 outputHash; bool acknowledged; }
    struct Counts { uint256 paid; uint256 delivered; uint256 acknowledged; }
    mapping(bytes32 => Paid) public orders;
    mapping(address => Counts) public reputation;
    mapping(bytes32 => bool) public observations;
    event OrderPaid(bytes32 indexed orderId, bytes32 indexed agentId, address indexed seller, bytes32 serviceHash, uint8 category, bytes32 unitHash, uint256 quantity, uint256 unitPrice, uint256 amount, bytes32 inputHash);
    event BuyerAcknowledged(bytes32 indexed orderId, address indexed payer, bytes32 outputHash);
    event DeliveryAttested(bytes32 indexed orderId, address indexed seller, bytes32 outputHash);
    event ObservationRecorded(bytes32 indexed observationHash, bytes32 indexed metricId, uint64 windowStart, uint64 windowEnd, int256 value, uint256 baseline, bytes32 inputRoot, bytes32 methodologyHash);
    event AttesterChanged(address indexed previous, address indexed current);
    constructor(address controller_, address attester_) { if(controller_ == address(0) || attester_ == address(0)) revert Invalid(); controller = controller_; attester = attester_; }
    function wireSettlement(address target) external { if(msg.sender != controller) revert Unauthorized(); if(settlement != address(0) || target.code.length == 0) revert Invalid(); settlement = target; }
    function setAttester(address target) external { if(msg.sender != controller) revert Unauthorized(); if(target == address(0)) revert Invalid(); emit AttesterChanged(attester, target); attester = target; }
    function recordPaid(bytes32 orderId, bytes32 agentId, address payer, address seller, bytes32 serviceHash, uint8 category, bytes32 unitHash, uint256 quantity, uint256 unitPrice, uint256 amount, bytes32 inputHash) external {
        if(msg.sender != settlement) revert Unauthorized(); if(orders[orderId].seller != address(0)) revert Invalid();
        orders[orderId] = Paid(payer, seller, serviceHash, inputHash, bytes32(0), false); reputation[seller].paid++;
        emit OrderPaid(orderId, agentId, seller, serviceHash, category, unitHash, quantity, unitPrice, amount, inputHash);
    }
    /// @dev Seller attestation is evidence of claimed delivery, not independently verified utility.
    function attestDelivery(bytes32 orderId, bytes32 outputHash) external {
        Paid storage p = orders[orderId]; if(msg.sender != p.seller) revert Unauthorized();
        if(outputHash == bytes32(0) || p.outputHash != bytes32(0)) revert Invalid();
        p.outputHash = outputHash; reputation[msg.sender].delivered++; emit DeliveryAttested(orderId, msg.sender, outputHash);
    }
    function acknowledgeDelivery(bytes32 orderId, bytes32 outputHash) external {
        Paid storage p = orders[orderId]; if(msg.sender != p.payer) revert Unauthorized();
        if(outputHash == bytes32(0) || outputHash != p.outputHash || p.acknowledged) revert Invalid();
        p.acknowledged = true; reputation[p.seller].acknowledged++;
        emit BuyerAcknowledged(orderId, msg.sender, outputHash);
    }
    function recordObservation(bytes32 metricId, uint64 start, uint64 end, int256 value, uint256 baseline, bytes32 inputRoot, bytes32 methodologyHash) external returns(bytes32 h) {
        if(msg.sender != attester) revert Unauthorized(); if(start >= end || end > block.timestamp || inputRoot == bytes32(0) || methodologyHash == bytes32(0)) revert Invalid();
        h = keccak256(abi.encode(block.chainid, address(this), metricId, start, end, value, baseline, inputRoot, methodologyHash));
        if(observations[h]) revert Invalid(); observations[h] = true;
        emit ObservationRecorded(h, metricId, start, end, value, baseline, inputRoot, methodologyHash);
    }
}
