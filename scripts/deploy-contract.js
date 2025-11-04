const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

async function deployContract() {
    try {
        console.log('Deploying RTI System Contract...');
        
        // Initialize web3
        const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
        
        // Check connection
        const isConnected = await web3.eth.net.isListening();
        console.log('Connected to Ganache:', isConnected);
        
        if (!isConnected) {
            throw new Error('Cannot connect to Ganache. Make sure it\'s running on http://localhost:8545');
        }

        // Get accounts
        const accounts = await web3.eth.getAccounts();
        console.log('Found accounts:', accounts.length);
        
        if (accounts.length === 0) {
            throw new Error('No accounts found in Ganache');
        }

        const deployer = accounts[0];
        console.log('Deploying from:', deployer);

        // Get balance
        const balance = await web3.eth.getBalance(deployer);
        console.log('Deployer balance:', web3.utils.fromWei(balance, 'ether'), 'ETH');

        // Load contract ABI and bytecode
        const contractPath = path.join(__dirname, '../build/contracts/RTISystem.json');
        if (!fs.existsSync(contractPath)) {
            throw new Error('Contract not compiled. Please run: npx truffle compile');
        }

        const contractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        const contractABI = contractData.abi;
        const contractBytecode = contractData.bytecode;

        console.log('Contract ABI loaded, Bytecode length:', contractBytecode.length);

        // Deploy contract
        const contract = new web3.eth.Contract(contractABI);
        
        console.log('Estimating gas...');
        const deployment = contract.deploy({
            data: contractBytecode
        });

        const gasEstimate = await deployment.estimateGas({ from: deployer });
        console.log('Gas estimate:', gasEstimate);

        console.log('Sending deployment transaction...');
        const deployedContract = await deployment.send({
            from: deployer,
            gas: gasEstimate,
            gasPrice: await web3.eth.getGasPrice()
        });

        const contractAddress = deployedContract.options.address;
        console.log('✅ Contract deployed at:', contractAddress);

        return {
            contractAddress: contractAddress,
            admin: deployer,
            accounts: accounts
        };
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        throw error;
    }
}

if (require.main === module) {
    deployContract()
        .then(result => {
            console.log('\n=== DEPLOYMENT SUCCESSFUL ===');
            console.log('Contract:', result.contractAddress);
            console.log('Admin:', result.admin);
            process.exit(0);
        })
        .catch(error => {
            console.error('Deployment failed:', error);
            process.exit(1);
        });
}

module.exports = deployContract;