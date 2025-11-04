const Web3 = require('web3');

class AccountManager {
    constructor() {
        this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
        this.accounts = [];
    }

    async initializeAccounts() {
        this.accounts = await this.web3.eth.getAccounts();
        console.log('Available accounts:', this.accounts);
        return this.accounts;
    }

    getAccount(index) {
        if (index >= this.accounts.length) {
            throw new Error('Account index out of bounds');
        }
        return this.accounts[index];
    }

    async getBalance(address) {
        const balance = await this.web3.eth.getBalance(address);
        return this.web3.utils.fromWei(balance, 'ether');
    }

    async signMessage(message, privateKey) {
        const signed = await this.web3.eth.accounts.sign(message, privateKey);
        return signed;
    }
}

module.exports = AccountManager;