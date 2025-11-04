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
            requests: [] // mirror of on-chain requests for quick lookup
        };
        fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    }
}

function readDb() {
    ensureDb();
    const raw = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(raw || '{}');
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

module.exports = {
    createUser,
    findUserById,
    verifySigninKey,
    addRequest,
    updateRequest,
    listRequestsBy,
};


