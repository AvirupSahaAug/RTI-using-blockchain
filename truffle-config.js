const path = require("path");

module.exports = {
  contracts_build_directory: path.join(__dirname, "build/contracts"),
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
  },
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    },
  },
};