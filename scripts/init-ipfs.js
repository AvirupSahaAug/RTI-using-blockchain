const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

function initIPFS() {
    console.log('Initializing IPFS...');
    
    // Create ipfs-storage directory if it doesn't exist
    const storagePath = path.join(__dirname, '../ipfs-storage');
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
        console.log('Created ipfs-storage directory');
    }
    
    // Check if IPFS is running
    exec('ipfs id', (error, stdout, stderr) => {
        if (error) {
            console.log('IPFS is not running. Please start IPFS daemon:');
            console.log('1. Open a new terminal');
            console.log('2. Run: ipfs daemon');
            console.log('3. Then run this setup again');
            return;
        }
        console.log('IPFS is running successfully');
    });
}

initIPFS();