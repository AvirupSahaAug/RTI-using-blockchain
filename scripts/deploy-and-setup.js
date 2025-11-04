const deployContract = require('./deploy-contract');
const updateContractAddress = require('./update-config');
const { exec } = require('child_process');

async function deployAndSetup() {
    try {
        console.log('Starting RTI System deployment...');
        console.log('Make sure:');
        console.log('1. Ganache is running on http://localhost:8545');
        console.log('2. IPFS daemon is running (optional for setup)');
        console.log('3. You have sufficient ETH in deployer account\n');

        // Deploy contract
        const result = await deployContract();
        
        if (result && result.contractAddress) {
            // Update contract configuration
            updateContractAddress(result.contractAddress);
            
            console.log('\n=== SETUP COMPLETED SUCCESSFULLY ===');
            console.log('📝 Contract Address:', result.contractAddress);
            console.log('👤 Admin Address:', result.admin);
            console.log('💰 Test Accounts:', result.accounts.length);
            
            console.log('\n🚀 Next steps:');
            console.log('1. Start the server: npm start');
            console.log('2. Access the application: http://localhost:3000');
            console.log('3. Start the app and provide one Ganache private key at startup');
            
            console.log('\n🔑 Sample private keys (from Ganache):');
            console.log('Check Ganache UI for private keys of each account');
        }
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('1. Make sure Ganache is running on port 8545');
        console.log('2. Check that accounts have ETH balance');
        console.log('3. Verify network connectivity');
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    deployAndSetup();
}

module.exports = deployAndSetup;