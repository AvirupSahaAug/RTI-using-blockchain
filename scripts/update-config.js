const fs = require('fs');
const path = require('path');

function updateContractAddress(address) {
    const configPath = path.join(__dirname, '../config/contract-config.json');
    const config = {
        contractAddress: address
    };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Contract address updated to:', address);
}

// If called from command line
if (require.main === module && process.argv[2]) {
    updateContractAddress(process.argv[2]);
}

module.exports = updateContractAddress;