const Web3 = require('web3');

async function checkEnvironment() {
    console.log('🔍 Checking environment...');
    
    try {
        // Check Ganache connection
        const web3 = new Web3('http://localhost:7545');
        const isConnected = await web3.eth.net.isListening();
        
        if (!isConnected) {
            throw new Error('Cannot connect to Ganache on http://localhost:7545');
        }
        console.log('✅ Connected to Ganache');

        // Check accounts
        const accounts = await web3.eth.getAccounts();
        console.log('✅ Found accounts:', accounts.length);
        
        if (accounts.length === 0) {
            throw new Error('No accounts found in Ganache');
        }

        // Check balances
        for (let i = 0; i < Math.min(accounts.length, 3); i++) {
            const balance = await web3.eth.getBalance(accounts[i]);
            console.log(`   Account ${i}: ${accounts[i]} - ${web3.utils.fromWei(balance, 'ether')} ETH`);
        }

        console.log('✅ Environment check passed');
        return true;
    } catch (error) {
        console.error('❌ Environment check failed:', error.message);
        console.log('\n💡 Please ensure:');
        console.log('1. Ganache is running on http://localhost:7545');
        console.log('2. Ganache is configured with accounts');
        console.log('3. Network is accessible');
        return false;
    }
}

if (require.main === module) {
    checkEnvironment();
}

module.exports = checkEnvironment;