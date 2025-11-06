const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'db.json');

function ensureDb() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dbPath)) {
        const initial = {
            users: [], // { id, name, aadhaar, role, signinKeyHash }
            requests: [], // mirror of on-chain requests for quick lookup
            complaints: [], // active complaints
            resolvedComplaints: [] // archived minimal records
        };
        fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    }
}

function readDb() {
    ensureDb();
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    // Backfill missing arrays for older files
    if (!parsed.users) parsed.users = [];
    if (!parsed.requests) parsed.requests = [];
    if (!parsed.complaints) parsed.complaints = [];
    if (!parsed.resolvedComplaints) parsed.resolvedComplaints = [];
    return parsed;
}

function writeDb(db) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function hashKey(key) {
    return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function generateUserId() {
    return 'U-' + crypto.randomBytes(4).toString('hex');
}

function createUser({ name, aadhaar, role, walletAddress }) {
    const db = readDb();
    const exists = db.users.find(u => u.aadhaar === aadhaar);
    if (exists) throw new Error('Aadhaar already registered');

    const id = generateUserId();
    const signinKey = crypto.randomBytes(32).toString('hex');
    const signinKeyHash = hashKey(signinKey);

    const user = { id, name, aadhaar, role, signinKeyHash, walletAddress: walletAddress || '' };
    db.users.push(user);
    writeDb(db);
    return { user, signinKey };
}

function findUserById(id) {
    const db = readDb();
    return db.users.find(u => u.id === id) || null;
}

function verifySigninKey(id, signinKey) {
    const user = findUserById(id);
    if (!user) return false;
    return user.signinKeyHash === hashKey(signinKey);
}

function addRequest(record) {
    const db = readDb();
    db.requests.push(record);
    writeDb(db);
}

function updateRequest(id, updates) {
    const db = readDb();
    const r = db.requests.find(req => String(req.id) === String(id));
    if (r) {
        Object.assign(r, updates);
        writeDb(db);
    }
}

function listRequestsBy(predicate) {
    const db = readDb();
    return db.requests.filter(predicate);
}

function generateComplaintId() {
    return 'C-' + crypto.randomBytes(4).toString('hex');
}

function addComplaint(record) {
    const db = readDb();
    db.complaints.push(record);
    writeDb(db);
}

function updateComplaint(id, updates) {
    const db = readDb();
    const c = db.complaints.find(x => String(x.id) === String(id));
    if (c) {
        Object.assign(c, updates);
        writeDb(db);
    }
}

function listComplaintsBy(predicate) {
    const db = readDb();
    return db.complaints.filter(predicate);
}

function addResolvedComplaint(record) {
    const db = readDb();
    db.resolvedComplaints.push(record);
    writeDb(db);
}

function finalizeComplaintIfResolved(id) {
    const db = readDb();
    const idx = db.complaints.findIndex(x => String(x.id) === String(id));
    if (idx === -1) return false;
    const c = db.complaints[idx];
    if (c.resolvedByUser && c.resolvedByAdmin) {
        const archived = {
            id: c.id,
            requestId: c.requestId,
            clientUserId: c.clientUserId,
            officerUserId: c.officerUserId,
            complaintCreatedAt: c.createdAt,
            resolvedAt: Date.now()
        };
        db.resolvedComplaints.push(archived);
        db.complaints.splice(idx, 1);
        writeDb(db);
        return true;
    }
    return false;
}

module.exports = {
    createUser,
    findUserById,
    verifySigninKey,
    addRequest,
    updateRequest,
    listRequestsBy,
    // complaints
    generateComplaintId,
    addComplaint,
    updateComplaint,
    listComplaintsBy,
    addResolvedComplaint,
    finalizeComplaintIfResolved,
};


