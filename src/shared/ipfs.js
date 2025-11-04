// Ensure Node's global fetch includes duplex option when sending a body (Node 18+ / 20+ / 22+)
const originalFetch = global.fetch;
if (originalFetch) {
    global.fetch = (input, init = {}) => {
        if (init && init.body && !init.duplex) {
            init.duplex = 'half';
        }
        return originalFetch(input, init);
    };
}

const create = require('ipfs-http-client');

class IPFSService {
    constructor() {
        this.ipfs = create({ url: 'http://localhost:5001' });
        console.log('IPFS client initialized');
    }

    async addFile(fileBuffer) {
        try {
            const result = await this.ipfs.add(fileBuffer);
            const cid = (result && (result.cid?.toString?.() || result.path)) || '';
            if (!cid) {
                throw new Error('IPFS add returned no CID');
            }
            await this.ipfs.pin.add(cid);
            console.log('File added to IPFS:', cid);
            return cid;
        } catch (error) {
            console.error('IPFS add error:', error);
            throw new Error('Failed to upload file to IPFS: ' + error.message);
        }
    }

    async getFile(cid) {
        try {
            const chunks = [];
            for await (const chunk of this.ipfs.cat(cid)) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } catch (error) {
            console.error('IPFS get error:', error);
            throw new Error('Failed to download file from IPFS: ' + error.message);
        }
    }
}

module.exports = IPFSService;