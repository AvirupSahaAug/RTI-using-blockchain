// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract RTISystem {
    enum RequestStatus { Pending, Assigned, Responded, Completed }

    // This contract is now app-ID driven. Server signs all txs.
    struct RTIRequest {
        uint256 id;
        string clientUserId; // App-level user ID of client
        string requestHash;  // IPFS hash for request file
        string description;
        string assignedOfficerUserId; // App-level user ID of officer
        string responseHash; // IPFS hash for response file
        RequestStatus status;
        uint256 createdAt;
        uint256 assignedAt;
        uint256 respondedAt;
    }

    mapping(uint256 => RTIRequest) public requests;
    uint256 public requestCount;

    event RequestCreated(uint256 indexed requestId, string clientUserId, string requestHash);
    event RequestAssigned(uint256 indexed requestId, string officerUserId);
    event RequestResponded(uint256 indexed requestId, string responseHash);

    constructor() {}

    function createRequest(string memory _clientUserId, string memory _requestHash, string memory _description) public {
        requestCount++;
        requests[requestCount] = RTIRequest({
            id: requestCount,
            clientUserId: _clientUserId,
            requestHash: _requestHash,
            description: _description,
            assignedOfficerUserId: "",
            responseHash: "",
            status: RequestStatus.Pending,
            createdAt: block.timestamp,
            assignedAt: 0,
            respondedAt: 0
        });

        emit RequestCreated(requestCount, _clientUserId, _requestHash);
    }

    function assignRequest(uint256 _requestId, string memory _officerUserId) public {
        require(requests[_requestId].status == RequestStatus.Pending, "Request already assigned");

        requests[_requestId].assignedOfficerUserId = _officerUserId;
        requests[_requestId].status = RequestStatus.Assigned;
        requests[_requestId].assignedAt = block.timestamp;

        emit RequestAssigned(_requestId, _officerUserId);
    }

    function submitResponse(uint256 _requestId, string memory _officerUserId, string memory _responseHash) public {
        require(requests[_requestId].status == RequestStatus.Assigned, "Request not assigned");
        require(keccak256(bytes(requests[_requestId].assignedOfficerUserId)) == keccak256(bytes(_officerUserId)), "Not assigned to this officer");

        requests[_requestId].responseHash = _responseHash;
        requests[_requestId].status = RequestStatus.Responded;
        requests[_requestId].respondedAt = block.timestamp;

        emit RequestResponded(_requestId, _responseHash);
    }

    function getRequest(uint256 _requestId) public view returns (RTIRequest memory) {
        return requests[_requestId];
    }

    function getRequestsByStatus(RequestStatus _status) public view returns (RTIRequest[] memory) {
        uint256 count = 0;
        for (uint256 i = 1; i <= requestCount; i++) {
            if (requests[i].status == _status) {
                count++;
            }
        }

        RTIRequest[] memory result = new RTIRequest[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= requestCount; i++) {
            if (requests[i].status == _status) {
                result[index] = requests[i];
                index++;
            }
        }
        return result;
    }
}