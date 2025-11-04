const Web3 = require('web3');
const RTISystem = require('../src/shared/contracts/RTISystem.json');
const fs = require('fs');
const path = require('path');

async function setup() {
    try {
        console.log('Setting up RTI System...');
        
        // Initialize web3
        const web3 = new Web3('http://localhost:7545');
        
        // Get accounts
        const accounts = await web3.eth.getAccounts();
        console.log('Available accounts:', accounts);
        
        if (accounts.length === 0) {
            throw new Error('No accounts found. Make sure Ganache is running on http://localhost:7545');
        }

        // Get contract ABI and bytecode
        const contractABI = RTISystem.abi;
        const contractBytecode = RTISystem.bytecode;

        // Deploy contract
        console.log('Deploying contract...');
        const contract = new web3.eth.Contract(contractABI);
        
        const deployment = contract.deploy({
            data: contractBytecode,
            arguments: [] // No constructor arguments
        });

        const gas = await deployment.estimateGas();
        const gasPrice = await web3.eth.getGasPrice();

        const deployedContract = await deployment.send({
            from: accounts[0],
            gas: gas,
            gasPrice: gasPrice
        });

        const contractAddress = deployedContract.options.address;
        console.log('RTI System deployed at:', contractAddress);
        
        const admin = accounts[0];
        console.log('Admin address:', admin);
        
        console.log('Setup completed successfully!');
        console.log('Contract address:', contractAddress);
        console.log('Admin address:', admin);
        
        return {
            contractAddress: contractAddress,
            admin: admin,
            accounts: accounts
        };
    } catch (error) {
        console.error('Setup failed:', error);
        throw error;
    }
}

// Run setup if called directly
if (require.main === module) {
    setup();
}

module.exports = setup;