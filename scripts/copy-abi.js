const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'build', 'contracts', 'RTISystem.json');
const destDir = path.join(__dirname, '..', 'src', 'shared', 'contracts');
const dest = path.join(destDir, 'RTISystem.json');

if (!fs.existsSync(src)) {
    console.error('ABI not found at', src, '- did you run truffle compile?');
    process.exit(1);
}
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

fs.copyFileSync(src, dest);
console.log('Copied ABI to', dest);


