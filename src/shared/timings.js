const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const timingsPath = path.join(dataDir, 'timings.json');

function ensureTimings() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(timingsPath)) {
        const initial = {
            request: [],
            assignment: [],
            response: []
        };
        fs.writeFileSync(timingsPath, JSON.stringify(initial, null, 2));
    }
}

function readTimings() {
    ensureTimings();
    const raw = fs.readFileSync(timingsPath, 'utf8');
    return JSON.parse(raw || '{}');
}

function writeTimings(timings) {
    fs.writeFileSync(timingsPath, JSON.stringify(timings, null, 2));
}

function appendRequestTiming(entry) {
    const timings = readTimings();
    timings.request.push(entry);
    writeTimings(timings);
}

function appendAssignmentTiming(entry) {
    const timings = readTimings();
    timings.assignment.push(entry);
    writeTimings(timings);
}

function appendResponseTiming(entry) {
    const timings = readTimings();
    timings.response.push(entry);
    writeTimings(timings);
}

module.exports = {
    appendRequestTiming,
    appendAssignmentTiming,
    appendResponseTiming,
};


