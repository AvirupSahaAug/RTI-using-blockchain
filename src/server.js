const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const Web3 = require('web3');
const RTISystem = require('./shared/contracts/RTISystem.json');
const IPFSService = require('./shared/ipfs');
const AccountManager = require('./shared/accounts');
const { appendRequestTiming, appendAssignmentTiming, appendResponseTiming } = require('./shared/timings');
const readline = require('readline');
const { createUser, findUserById, verifySigninKey, addRequest: dbAddRequest, updateRequest: dbUpdateRequest, listRequestsBy, generateComplaintId, addComplaint, updateComplaint, listComplaintsBy, finalizeComplaintIfResolved } = require('./shared/db');

const app = express();
const port = 3000;
let ganachePrivateKey = process.env.GANACHE_PRIVATE_KEY || '';
let ganacheAccountAddress = '';

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'rti-blockchain-secret',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Initialize services
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const ipfsService = new IPFSService();
const accountManager = new AccountManager();

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Contract instance (will be set after deployment)
let rtiContract;
let contractAddress;

// Load contract address from config
try {
    const config = require('../config/contract-config.json');
    contractAddress = config.contractAddress;
    rtiContract = new web3.eth.Contract(RTISystem.abi, contractAddress);
    console.log('Contract loaded:', contractAddress);
} catch (error) {
    console.log('Contract config not found. Please run setup first.');
}

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Registration routes
app.get('/register', (req, res) => {
    res.render('register', { error: null, success: null, user: req.session.user });
});

app.post('/register', (req, res) => {
    const { name, aadhaar, role, walletAddress } = req.body;
    try {
        const { user, signinKey } = createUser({ name, aadhaar, role, walletAddress });
        // Show signinKey once to the user
        res.render('register', { error: null, success: { id: user.id, signinKey }, user: req.session.user });
    } catch (e) {
        res.render('register', { error: e.message, success: null, user: req.session.user });
    }
});

// Authentication routes
app.get('/login', (req, res) => {
    res.render('login', { error: null, user: req.session.user });
});

app.post('/login', async (req, res) => {
    const { userId, signinKey } = req.body;
    try {
        const userRecord = findUserById(userId);
        if (!userRecord) throw new Error('User not found');
        if (!verifySigninKey(userId, signinKey)) throw new Error('Invalid sign-in key');

        req.session.user = {
            id: userRecord.id,
            role: userRecord.role,
            profile: { name: userRecord.name, aadhaar: userRecord.aadhaar }
        };

        res.redirect(`/${userRecord.role}/dashboard`);
    } catch (error) {
        res.render('login', { error: error.message, user: req.session.user });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Client routes
app.get('/client/dashboard', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'client') {
        return res.redirect('/login');
    }
    
    try {
        // Get user's requests
        const requests = listRequestsBy(r => r.clientId === req.session.user.id);
        const myComplaints = listComplaintsBy(c => c.clientUserId === req.session.user.id);
        res.render('client/dashboard', { user: req.session.user, requests, complaints: myComplaints });
    } catch (error) {
        res.render('client/dashboard', { user: req.session.user, requests: [], complaints: [], error: error.message });
    }
});

// In client request route
app.post('/client/request', upload.single('document'), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'client') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        const overallStart = Date.now();
        const { description } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Upload to IPFS
        const ipfsStart = Date.now();
        const ipfsHash = await ipfsService.addFile(file.buffer);
        const ipfsEnd = Date.now();
        
        // Create request on blockchain
        const chainStart = Date.now();
        const result = await createRTIRequest(
            req.session.user.id,
            ipfsHash,
            description
        );
        const chainEnd = Date.now();
        // store in DB mirror
        const assignedRequestId = result.events?.RequestCreated?.returnValues?.requestId || Date.now();
        dbAddRequest({ id: assignedRequestId, clientId: req.session.user.id, description, requestHash: ipfsHash, requestFilename: file.originalname, status: '0', createdAt: Date.now() });
        const overallEnd = Date.now();

        // Append timing record for request flow
        appendRequestTiming({
            requestId: String(assignedRequestId),
            clientUserId: req.session.user.id,
            startTime: overallStart,
            ipfsStart,
            ipfsEnd,
            chainStart,
            chainEnd,
            endTime: overallEnd,
            ipfsMs: ipfsEnd - ipfsStart,
            chainMs: chainEnd - chainStart,
            totalMs: overallEnd - overallStart,
            ipfsHash,
            txHash: result.transactionHash || ''
        });
        
        res.json({ success: true, hash: ipfsHash, tx: result.transactionHash });
    } catch (error) {
        console.error('Request creation error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Admin routes
app.get('/admin/dashboard', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }
    
    try {
        const pendingRequests = listRequestsBy(r => r.status === '0');
        const allAssigned = listRequestsBy(r => r.status === '1');
        const respondedRequests = listRequestsBy(r => r.status === '2');
        const nowMs = Date.now();
        const fiveMinutesMs = 5 * 60 * 1000;
        const overdueAssignedRequests = allAssigned.filter(r => r.assignedAt && (nowMs - Number(r.assignedAt)) > fiveMinutesMs);
        const assignedRequests = allAssigned.filter(r => !r.assignedAt || (nowMs - Number(r.assignedAt)) <= fiveMinutesMs);
        const officers = require('./shared/db').listRequestsBy ? null : null;
        // Build officer list from DB users
        const db = require('fs').existsSync(require('path').join(__dirname, '..', 'data', 'db.json'))
            ? JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'db.json'), 'utf8'))
            : { users: [] };
        const officerUsers = (db.users || []).filter(u => u.role === 'officer');

        const complaints = listComplaintsBy(() => true);
        const resolvedComplaints = (require('fs').existsSync(require('path').join(__dirname, '..', 'data', 'db.json'))
            ? JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data', 'db.json'), 'utf8'))
            : { resolvedComplaints: [] }).resolvedComplaints || [];

        res.render('admin/dashboard', {
            user: req.session.user,
            pendingRequests,
            assignedRequests,
            respondedRequests,
            overdueAssignedRequests,
            officerUsers,
            complaints,
            resolvedComplaints
        });
    } catch (error) {
        res.render('admin/dashboard', {
            user: req.session.user,
            pendingRequests: [],
            assignedRequests: [],
            respondedRequests: [],
            overdueAssignedRequests: [],
            officerUsers: [],
            complaints: [],
            resolvedComplaints: [],
            error: error.message
        });
    }
});

app.post('/admin/assign', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        const overallStart = Date.now();
        const { requestId, officerUserId } = req.body;
        const officer = findUserById(officerUserId);
        if (!officer || officer.role !== 'officer') {
            return res.status(400).json({ error: 'Invalid officer selected' });
        }

        const result = await assignRequest(
            requestId,
            officerUserId
        );
        dbUpdateRequest(requestId, { status: '1', assignedOfficerUserId: officerUserId, assignedAt: Date.now() });
        const overallEnd = Date.now();

        appendAssignmentTiming({
            requestId: String(requestId),
            adminUserId: req.session.user.id,
            officerUserId: String(officerUserId),
            startTime: overallStart,
            endTime: overallEnd,
            totalMs: overallEnd - overallStart,
            txHash: result.transactionHash || ''
        });
        
        res.json({ success: true, tx: result.transactionHash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/add-officer', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        const { officerAddress } = req.body;
        
        const result = await addOfficer(
            req.session.user.privateKey,
            officerAddress
        );
        
        res.json({ success: true, tx: result.transactionHash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Officer routes
app.get('/officer/dashboard', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'officer') {
        return res.redirect('/login');
    }
    
    try {
        const assignedRequests = listRequestsBy(r => r.assignedOfficerUserId === req.session.user.id && r.status === '1');
        const myComplaints = listComplaintsBy(c => c.officerUserId === req.session.user.id);
        res.render('officer/dashboard', { user: req.session.user, requests: assignedRequests, complaints: myComplaints });
    } catch (error) {
        res.render('officer/dashboard', { user: req.session.user, requests: [], complaints: [], error: error.message });
    }
});

app.post('/officer/response', upload.single('document'), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'officer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    try {
        const overallStart = Date.now();
        const { requestId } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Upload to IPFS
        const ipfsStart = Date.now();
        const ipfsHash = await ipfsService.addFile(file.buffer);
        const ipfsEnd = Date.now();
        
        // Submit response on blockchain
        const chainStart = Date.now();
        const result = await submitResponse(
            requestId,
            req.session.user.id,
            ipfsHash
        );
        const chainEnd = Date.now();
        dbUpdateRequest(requestId, { responseHash: ipfsHash, responseFilename: file.originalname, status: '2', respondedAt: Date.now() });
        const overallEnd = Date.now();

        appendResponseTiming({
            requestId: String(requestId),
            officerUserId: req.session.user.id,
            startTime: overallStart,
            ipfsStart,
            ipfsEnd,
            chainStart,
            chainEnd,
            endTime: overallEnd,
            ipfsMs: ipfsEnd - ipfsStart,
            chainMs: chainEnd - chainStart,
            totalMs: overallEnd - overallStart,
            ipfsHash,
            txHash: result.transactionHash || ''
        });
        
        res.json({ success: true, hash: ipfsHash, tx: result.transactionHash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// File download route
app.get('/download/:hash', async (req, res) => {
    try {
        const fileBuffer = await ipfsService.getFile(req.params.hash);
        // Try to resolve filename from DB mirror or query param
        let filename = req.query.filename;
        if (!filename) {
            const match = listRequestsBy(r => r.requestHash === req.params.hash || r.responseHash === req.params.hash)[0];
            if (match) {
                if (match.requestHash === req.params.hash && match.requestFilename) filename = match.requestFilename;
                if (match.responseHash === req.params.hash && match.responseFilename) filename = match.responseFilename;
            }
        }
        if (!filename) filename = 'document';

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        res.send(fileBuffer);
    } catch (error) {
        res.status(500).send('Error downloading file');
    }
});

// Complaints routes
app.post('/client/complaint', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'client') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const { requestId, text } = req.body;
        const request = listRequestsBy(r => String(r.id) === String(requestId))[0];
        if (!request || request.clientId !== req.session.user.id) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        if (!request.responseHash) {
            return res.status(400).json({ error: 'Response not delivered yet' });
        }
        const existing = listComplaintsBy(c => String(c.requestId) === String(requestId));
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Complaint already exists for this request' });
        }
        const complaint = {
            id: generateComplaintId(),
            requestId: String(requestId),
            clientUserId: req.session.user.id,
            officerUserId: request.assignedOfficerUserId || '',
            text: String(text || '').slice(0, 5000),
            createdAt: Date.now(),
            notified: false,
            notifiedAt: null,
            resolutionText: '',
            resolutionAt: null,
            resolvedByUser: false,
            resolvedByAdmin: false
        };
        addComplaint(complaint);
        res.json({ success: true, complaintId: complaint.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin/complaints/notify', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const { complaintId } = req.body;
        updateComplaint(complaintId, { notified: true, notifiedAt: Date.now() });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/officer/complaints/resolve', upload.single('document'), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'officer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const { complaintId } = req.body;
        const file = req.file;
        const comp = listComplaintsBy(c => String(c.id) === String(complaintId))[0];
        if (!comp || comp.officerUserId !== req.session.user.id) {
            return res.status(400).json({ error: 'Invalid complaint' });
        }
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const ipfsHash = await ipfsService.addFile(file.buffer);
        updateComplaint(complaintId, { resolutionHash: ipfsHash, resolutionFilename: file.originalname, resolutionAt: Date.now() });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/admin/complaints/mark-resolved', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const { complaintId } = req.body;
        updateComplaint(complaintId, { resolvedByAdmin: true });
        finalizeComplaintIfResolved(complaintId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/client/complaints/mark-resolved', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'client') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    try {
        const { complaintId } = req.body;
        const comp = listComplaintsBy(c => String(c.id) === String(complaintId))[0];
        if (!comp || comp.clientUserId !== req.session.user.id) {
            return res.status(400).json({ error: 'Invalid complaint' });
        }
        updateComplaint(complaintId, { resolvedByUser: true });
        finalizeComplaintIfResolved(complaintId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Blockchain interaction functions
async function createRTIRequest(clientUserId, ipfsHash, description) {
    const data = rtiContract.methods.createRequest(clientUserId, ipfsHash, description).encodeABI();
    return await sendTransaction(data);
}

async function assignRequest(requestId, officerUserId) {
    const data = rtiContract.methods.assignRequest(requestId, officerUserId).encodeABI();
    return await sendTransaction(data);
}

async function submitResponse(requestId, officerUserId, responseHash) {
    const data = rtiContract.methods.submitResponse(requestId, officerUserId, responseHash).encodeABI();
    return await sendTransaction(data);
}

// addOfficer removed in ID-based contract

async function sendTransaction(data) {
    if (!ganachePrivateKey) throw new Error('Ganache private key not set');
    const account = web3.eth.accounts.privateKeyToAccount(ganachePrivateKey);
    const tx = {
        from: account.address,
        to: contractAddress,
        data: data,
        gas: 500000,
        gasPrice: await web3.eth.getGasPrice()
    };
    
    const signed = await web3.eth.accounts.signTransaction(tx, ganachePrivateKey);
    return await web3.eth.sendSignedTransaction(signed.rawTransaction);
}

async function getClientRequests(clientAddress) {
    const requests = [];
    const requestCount = await rtiContract.methods.requestCount().call();
    
    for (let i = 1; i <= requestCount; i++) {
        const request = await rtiContract.methods.getRequest(i).call();
        if (request.client.toLowerCase() === clientAddress.toLowerCase()) {
            requests.push(request);
        }
    }
    
    return requests;
}

async function getOfficerRequests(officerAddress) {
    const requests = [];
    const requestCount = await rtiContract.methods.requestCount().call();
    
    for (let i = 1; i <= requestCount; i++) {
        const request = await rtiContract.methods.getRequest(i).call();
        if (request.assignedOfficer.toLowerCase() === officerAddress.toLowerCase() && 
            request.status === '1') { // Assigned
            requests.push(request);
        }
    }
    
    return requests;
}

async function getRequestsByStatus(status) {
    return await rtiContract.methods.getRequestsByStatus(status).call();
}

async function getOfficers() {
    // This would require additional contract methods to get all officers
    // For now, return empty array
    return [];
}

async function promptForGanacheKeyThenStart() {
    if (ganachePrivateKey) {
        const acc = web3.eth.accounts.privateKeyToAccount(ganachePrivateKey);
        ganacheAccountAddress = acc.address;
        startServer();
        return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter Ganache private key (0x...): ', async (answer) => {
        try {
            ganachePrivateKey = answer.trim();
            const acc = web3.eth.accounts.privateKeyToAccount(ganachePrivateKey);
            ganacheAccountAddress = acc.address;
            console.log('Using Ganache account:', ganacheAccountAddress);
            rl.close();
            startServer();
        } catch (e) {
            console.error('Invalid private key. Exiting.');
            process.exit(1);
        }
    });
}

function startServer() {
    app.listen(port, () => {
        console.log(`RTI System running on http://localhost:${port}`);
        console.log('Make sure:');
        console.log('1. Ganache is running on http://localhost:8545');
        console.log('2. IPFS daemon is running');
        console.log('3. Contract is deployed and config is set');
    });
}

promptForGanacheKeyThenStart();