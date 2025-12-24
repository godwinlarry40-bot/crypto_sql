const axios = require('axios');
const Web3 = require('web3');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');
const bip32 = BIP32Factory(ecc);
const bip39 = require('bip39');
const logger = require('../utils/logger');

class BlockchainService {
  constructor() {
    // Initialize blockchain connections
    this.providers = {
      ethereum: new Web3(new Web3.providers.HttpProvider(
        process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your-infura-key'
      )),
      bitcoin: {
        network: bitcoin.networks.bitcoin,
        explorer: process.env.BITCOIN_EXPLORER_URL || 'https://blockstream.info/api'
      }
    };

    // API keys for blockchain services
    this.apiKeys = {
      blockcypher: process.env.BLOCKCYPHER_API_KEY,
      infura: process.env.INFURA_API_KEY,
      etherscan: process.env.ETHERSCAN_API_KEY
    };
  }

  // Generate new wallet
  async generateWallet(currency, network = 'mainnet') {
    try {
      switch (currency.toUpperCase()) {
        case 'BTC':
          return this.generateBitcoinWallet(network);
        case 'ETH':
          return this.generateEthereumWallet();
        case 'BNB':
          return this.generateBNBWallet(network);
        case 'TRX':
          return this.generateTronWallet();
        case 'SOL':
          return this.generateSolanaWallet();
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }
    } catch (error) {
      logger.error(`Generate wallet error: ${error.message}`);
      throw error;
    }
  }

  // Generate Bitcoin wallet
  generateBitcoinWallet(network = 'mainnet') {
    try {
      const mnemonic = bip39.generateMnemonic();
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const root = bip32.fromSeed(seed);
      
      const path = network === 'testnet' 
        ? "m/44'/1'/0'/0/0" 
        : "m/44'/0'/0'/0/0";
      
      const child = root.derivePath(path);
      const { address } = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin
      });

      return {
        address,
        privateKey: child.privateKey.toString('hex'),
        mnemonic,
        currency: 'BTC',
        network,
        derivationPath: path
      };
    } catch (error) {
      logger.error(`Generate Bitcoin wallet error: ${error.message}`);
      throw error;
    }
  }

  // Generate Ethereum wallet
  generateEthereumWallet() {
    try {
      const web3 = this.providers.ethereum;
      const account = web3.eth.accounts.create();
      
      return {
        address: account.address,
        privateKey: account.privateKey,
        currency: 'ETH',
        network: 'mainnet'
      };
    } catch (error) {
      logger.error(`Generate Ethereum wallet error: ${error.message}`);
      throw error;
    }
  }

  // Generate BNB wallet
  generateBNBWallet(network = 'mainnet') {
    try {
      const web3 = new Web3(
        network === 'testnet' 
          ? 'https://data-seed-prebsc-1-s1.binance.org:8545'
          : 'https://bsc-dataseed.binance.org/'
      );
      
      const account = web3.eth.accounts.create();
      
      return {
        address: account.address,
        privateKey: account.privateKey,
        currency: 'BNB',
        network
      };
    } catch (error) {
      logger.error(`Generate BNB wallet error: ${error.message}`);
      throw error;
    }
  }

  // Generate Tron wallet
  generateTronWallet() {
    try {
      // Tron uses same address format as Ethereum
      const TronWeb = require('tronweb');
      const tronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY }
      });
      
      const account = tronWeb.createAccount();
      
      return {
        address: account.address.base58,
        privateKey: account.privateKey,
        currency: 'TRX',
        network: 'mainnet'
      };
    } catch (error) {
      logger.error(`Generate Tron wallet error: ${error.message}`);
      throw error;
    }
  }

  // Generate Solana wallet
  generateSolanaWallet() {
    try {
      const solanaWeb3 = require('@solana/web3.js');
      const keypair = solanaWeb3.Keypair.generate();
      
      return {
        address: keypair.publicKey.toString(),
        privateKey: Buffer.from(keypair.secretKey).toString('hex'),
        currency: 'SOL',
        network: 'mainnet'
      };
    } catch (error) {
      logger.error(`Generate Solana wallet error: ${error.message}`);
      throw error;
    }
  }

  // Get wallet balance
  async getWalletBalance(address, currency, network = 'mainnet') {
    try {
      switch (currency.toUpperCase()) {
        case 'BTC':
          return this.getBitcoinBalance(address, network);
        case 'ETH':
          return this.getEthereumBalance(address);
        case 'USDT':
          return this.getERC20Balance(address, '0xdAC17F958D2ee523a2206206994597C13D831ec7');
        case 'BNB':
          return this.getBNBBalance(address, network);
        case 'TRX':
          return this.getTronBalance(address);
        case 'SOL':
          return this.getSolanaBalance(address);
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }
    } catch (error) {
      logger.error(`Get wallet balance error: ${error.message}`);
      throw error;
    }
  }

  // Get Bitcoin balance
  async getBitcoinBalance(address, network = 'mainnet') {
    try {
      const explorerUrl = network === 'testnet'
        ? 'https://blockstream.info/testnet/api'
        : 'https://blockstream.info/api';
      
      const response = await axios.get(`${explorerUrl}/address/${address}`);
      
      return {
        address,
        confirmed: response.data.chain_stats.funded_txo_sum - response.data.chain_stats.spent_txo_sum,
        unconfirmed: response.data.mempool_stats.funded_txo_sum - response.data.mempool_stats.spent_txo_sum,
        total: (response.data.chain_stats.funded_txo_sum + response.data.mempool_stats.funded_txo_sum) -
               (response.data.chain_stats.spent_txo_sum + response.data.mempool_stats.spent_txo_sum),
        currency: 'BTC',
        network,
        unit: 'satoshi'
      };
    } catch (error) {
      logger.error(`Get Bitcoin balance error: ${error.message}`);
      throw error;
    }
  }

  // Get Ethereum balance
  async getEthereumBalance(address) {
    try {
      const web3 = this.providers.ethereum;
      const balanceWei = await web3.eth.getBalance(address);
      const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
      
      return {
        address,
        balance: balanceEth,
        balanceWei,
        currency: 'ETH',
        network: 'mainnet',
        unit: 'ETH'
      };
    } catch (error) {
      logger.error(`Get Ethereum balance error: ${error.message}`);
      throw error;
    }
  }

  // Get ERC20 token balance
  async getERC20Balance(address, contractAddress) {
    try {
      const web3 = this.providers.ethereum;
      
      // ERC20 ABI for balanceOf function
      const minABI = [
        {
          constant: true,
          inputs: [{ name: '_owner', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: 'balance', type: 'uint256' }],
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'decimals',
          outputs: [{ name: '', type: 'uint8' }],
          type: 'function'
        }
      ];
      
      const contract = new web3.eth.Contract(minABI, contractAddress);
      const balance = await contract.methods.balanceOf(address).call();
      const decimals = await contract.methods.decimals().call();
      
      const adjustedBalance = balance / Math.pow(10, decimals);
      
      return {
        address,
        balance: adjustedBalance,
        rawBalance: balance,
        decimals,
        contractAddress,
        currency: 'ERC20',
        unit: 'token'
      };
    } catch (error) {
      logger.error(`Get ERC20 balance error: ${error.message}`);
      throw error;
    }
  }

  // Get BNB balance
  async getBNBBalance(address, network = 'mainnet') {
    try {
      const web3 = new Web3(
        network === 'testnet' 
          ? 'https://data-seed-prebsc-1-s1.binance.org:8545'
          : 'https://bsc-dataseed.binance.org/'
      );
      
      const balanceWei = await web3.eth.getBalance(address);
      const balanceBnb = web3.utils.fromWei(balanceWei, 'ether');
      
      return {
        address,
        balance: balanceBnb,
        balanceWei,
        currency: 'BNB',
        network,
        unit: 'BNB'
      };
    } catch (error) {
      logger.error(`Get BNB balance error: ${error.message}`);
      throw error;
    }
  }

  // Get Tron balance
  async getTronBalance(address) {
    try {
      const TronWeb = require('tronweb');
      const tronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY }
      });
      
      const balance = await tronWeb.trx.getBalance(address);
      const balanceTrx = balance / 1000000; // Convert from SUN to TRX
      
      return {
        address,
        balance: balanceTrx,
        rawBalance: balance,
        currency: 'TRX',
        network: 'mainnet',
        unit: 'TRX'
      };
    } catch (error) {
      logger.error(`Get Tron balance error: ${error.message}`);
      throw error;
    }
  }

  // Get Solana balance
  async getSolanaBalance(address) {
    try {
      const solanaWeb3 = require('@solana/web3.js');
      const connection = new solanaWeb3.Connection(
        solanaWeb3.clusterApiUrl('mainnet-beta')
      );
      
      const publicKey = new solanaWeb3.PublicKey(address);
      const balance = await connection.getBalance(publicKey);
      const balanceSol = balance / 1000000000; // Convert from lamports to SOL
      
      return {
        address,
        balance: balanceSol,
        rawBalance: balance,
        currency: 'SOL',
        network: 'mainnet',
        unit: 'SOL'
      };
    } catch (error) {
      logger.error(`Get Solana balance error: ${error.message}`);
      throw error;
    }
  }

  // Send transaction
  async sendTransaction(currency, fromAddress, toAddress, amount, privateKey, network = 'mainnet') {
    try {
      switch (currency.toUpperCase()) {
        case 'BTC':
          return this.sendBitcoinTransaction(fromAddress, toAddress, amount, privateKey, network);
        case 'ETH':
          return this.sendEthereumTransaction(fromAddress, toAddress, amount, privateKey);
        case 'BNB':
          return this.sendBNBTransaction(fromAddress, toAddress, amount, privateKey, network);
        case 'TRX':
          return this.sendTronTransaction(fromAddress, toAddress, amount, privateKey);
        case 'SOL':
          return this.sendSolanaTransaction(fromAddress, toAddress, amount, privateKey);
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }
    } catch (error) {
      logger.error(`Send transaction error: ${error.message}`);
      throw error;
    }
  }

  // Send Bitcoin transaction
  async sendBitcoinTransaction(fromAddress, toAddress, amount, privateKey, network = 'mainnet') {
    try {
      // Note: This is a simplified implementation
      // In production, use proper UTXO management and fee calculation
      
      const bitcoinNetwork = network === 'testnet' 
        ? bitcoin.networks.testnet 
        : bitcoin.networks.bitcoin;
      
      // This would require:
      // 1. Fetch UTXOs for the address
      // 2. Calculate fees
      // 3. Build transaction
      // 4. Sign with private key
      // 5. Broadcast to network
      
      // For now, return mock transaction
      const txHash = `btc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        success: true,
        txHash,
        from: fromAddress,
        to: toAddress,
        amount,
        currency: 'BTC',
        network,
        fee: 0.0001,
        status: 'pending'
      };
    } catch (error) {
      logger.error(`Send Bitcoin transaction error: ${error.message}`);
      throw error;
    }
  }

  // Send Ethereum transaction
  async sendEthereumTransaction(fromAddress, toAddress, amount, privateKey) {
    try {
      const web3 = this.providers.ethereum;
      
      // Get nonce
      const nonce = await web3.eth.getTransactionCount(fromAddress, 'latest');
      
      // Get gas price
      const gasPrice = await web3.eth.getGasPrice();
      
      // Build transaction
      const tx = {
        from: fromAddress,
        to: toAddress,
        value: web3.utils.toWei(amount.toString(), 'ether'),
        gas: 21000,
        gasPrice,
        nonce,
        chainId: 1 // Mainnet
      };
      
      // Estimate gas (optional)
      try {
        const estimatedGas = await web3.eth.estimateGas(tx);
        tx.gas = estimatedGas;
      } catch (error) {
        // Use default gas
        logger.warn(`Gas estimation failed: ${error.message}`);
      }
      
      // Sign transaction
      const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
      
      // Send transaction
      const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        from: fromAddress,
        to: toAddress,
        amount,
        currency: 'ETH',
        network: 'mainnet',
        gasUsed: receipt.gasUsed,
        gasPrice: web3.utils.fromWei(gasPrice, 'gwei'),
        status: 'completed',
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      logger.error(`Send Ethereum transaction error: ${error.message}`);
      throw error;
    }
  }

  // Check transaction status
  async checkTransactionStatus(txHash, currency, network = 'mainnet') {
    try {
      switch (currency.toUpperCase()) {
        case 'BTC':
          return this.checkBitcoinTransaction(txHash, network);
        case 'ETH':
          return this.checkEthereumTransaction(txHash);
        case 'BNB':
          return this.checkBNBTransaction(txHash, network);
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }
    } catch (error) {
      logger.error(`Check transaction status error: ${error.message}`);
      throw error;
    }
  }

  // Check Bitcoin transaction
  async checkBitcoinTransaction(txHash, network = 'mainnet') {
    try {
      const explorerUrl = network === 'testnet'
        ? 'https://blockstream.info/testnet/api'
        : 'https://blockstream.info/api';
      
      const response = await axios.get(`${explorerUrl}/tx/${txHash}`);
      
      return {
        txHash,
        confirmations: response.data.status.confirmed ? response.data.status.block_height : 0,
        blockHeight: response.data.status.block_height,
        timestamp: response.data.status.block_time,
        fee: response.data.fee,
        size: response.data.size,
        currency: 'BTC',
        network,
        status: response.data.status.confirmed ? 'confirmed' : 'pending'
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return {
          txHash,
          confirmations: 0,
          status: 'not_found'
        };
      }
      logger.error(`Check Bitcoin transaction error: ${error.message}`);
      throw error;
    }
  }

  // Check Ethereum transaction
  async checkEthereumTransaction(txHash) {
    try {
      const web3 = this.providers.ethereum;
      
      const receipt = await web3.eth.getTransactionReceipt(txHash);
      
      if (!receipt) {
        // Transaction not mined yet
        const tx = await web3.eth.getTransaction(txHash);
        
        if (!tx) {
          return {
            txHash,
            confirmations: 0,
            status: 'not_found'
          };
        }
        
        return {
          txHash,
          confirmations: 0,
          status: 'pending',
          from: tx.from,
          to: tx.to,
          value: web3.utils.fromWei(tx.value, 'ether')
        };
      }
      
      // Get current block number
      const currentBlock = await web3.eth.getBlockNumber();
      const confirmations = receipt.blockNumber ? currentBlock - receipt.blockNumber + 1 : 0;
      
      return {
        txHash,
        confirmations,
        blockNumber: receipt.blockNumber,
        status: receipt.status ? 'success' : 'failed',
        from: receipt.from,
        to: receipt.to,
        gasUsed: receipt.gasUsed,
        cumulativeGasUsed: receipt.cumulativeGasUsed
      };
    } catch (error) {
      logger.error(`Check Ethereum transaction error: ${error.message}`);
      throw error;
    }
  }

  // Get transaction fee estimate
  async getFeeEstimate(currency, network = 'mainnet') {
    try {
      switch (currency.toUpperCase()) {
        case 'BTC':
          return this.getBitcoinFeeEstimate(network);
        case 'ETH':
          return this.getEthereumFeeEstimate();
        case 'BNB':
          return this.getBNBFeeEstimate(network);
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }
    } catch (error) {
      logger.error(`Get fee estimate error: ${error.message}`);
      throw error;
    }
  }

  // Get Bitcoin fee estimate
  async getBitcoinFeeEstimate(network = 'mainnet') {
    try {
      const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
      
      return {
        currency: 'BTC',
        network,
        estimates: {
          slow: response.data.hourFee,
          medium: response.data.halfHourFee,
          fast: response.data.fastestFee
        },
        unit: 'sat/vB',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Get Bitcoin fee estimate error: ${error.message}`);
      throw error;
    }
  }

  // Get Ethereum fee estimate
  async getEthereumFeeEstimate() {
    try {
      const web3 = this.providers.ethereum;
      
      // Get gas price from network
      const gasPrice = await web3.eth.getGasPrice();
      const gasPriceGwei = web3.utils.fromWei(gasPrice, 'gwei');
      
      // Get base fee from latest block
      const latestBlock = await web3.eth.getBlock('latest');
      const baseFee = latestBlock.baseFeePerGas 
        ? web3.utils.fromWei(latestBlock.baseFeePerGas, 'gwei')
        : gasPriceGwei;
      
      return {
        currency: 'ETH',
        network: 'mainnet',
        estimates: {
          slow: Math.max(1, parseFloat(baseFee) * 0.9).toFixed(2),
          medium: Math.max(1, parseFloat(baseFee) * 1.1).toFixed(2),
          fast: Math.max(1, parseFloat(baseFee) * 1.3).toFixed(2)
        },
        baseFee: parseFloat(baseFee).toFixed(2),
        unit: 'Gwei',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Get Ethereum fee estimate error: ${error.message}`);
      throw error;
    }
  }

  // Validate address
  async validateAddress(address, currency, network = 'mainnet') {
    try {
      switch (currency.toUpperCase()) {
        case 'BTC':
          return this.validateBitcoinAddress(address, network);
        case 'ETH':
          return this.validateEthereumAddress(address);
        case 'BNB':
          return this.validateBNBAddress(address, network);
        case 'TRX':
          return this.validateTronAddress(address);
        case 'SOL':
          return this.validateSolanaAddress(address);
        default:
          return {
            valid: false,
            message: `Unsupported currency: ${currency}`
          };
      }
    } catch (error) {
      logger.error(`Validate address error: ${error.message}`);
      return {
        valid: false,
        message: `Validation error: ${error.message}`
      };
    }
  }

  // Validate Bitcoin address
  validateBitcoinAddress(address, network = 'mainnet') {
    try {
      const bitcoinNetwork = network === 'testnet' 
        ? bitcoin.networks.testnet 
        : bitcoin.networks.bitcoin;
      
      // Try different address types
      const validators = [
        () => bitcoin.address.toOutputScript(address, bitcoinNetwork),
        () => {
          // Try Bech32 (bc1) addresses
          if (address.startsWith('bc1') || address.startsWith('tb1')) {
            const decoded = bitcoin.address.fromBech32(address);
            return decoded;
          }
          throw new Error('Not a Bech32 address');
        }
      ];
      
      for (const validator of validators) {
        try {
          validator();
          return {
            valid: true,
            message: 'Valid Bitcoin address',
            type: address.startsWith('bc1') || address.startsWith('tb1') ? 'bech32' : 'legacy',
            network
          };
        } catch (error) {
          continue;
        }
      }
      
      return {
        valid: false,
        message: 'Invalid Bitcoin address'
      };
    } catch (error) {
      return {
        valid: false,
        message: `Invalid Bitcoin address: ${error.message}`
      };
    }
  }

  // Validate Ethereum address
  validateEthereumAddress(address) {
    try {
      const web3 = this.providers.ethereum;
      const isValid = web3.utils.isAddress(address);
      
      return {
        valid: isValid,
        message: isValid ? 'Valid Ethereum address' : 'Invalid Ethereum address',
        checksum: isValid ? web3.utils.toChecksumAddress(address) : null
      };
    } catch (error) {
      return {
        valid: false,
        message: `Invalid Ethereum address: ${error.message}`
      };
    }
  }

  // Get supported networks
  getSupportedNetworks(currency) {
    const networks = {
      BTC: ['mainnet', 'testnet'],
      ETH: ['mainnet', 'ropsten', 'kovan', 'rinkeby', 'goerli'],
      BNB: ['mainnet', 'testnet'],
      TRX: ['mainnet', 'testnet'],
      SOL: ['mainnet', 'devnet', 'testnet'],
      USDT: ['ERC20', 'TRC20', 'BEP20', 'SOL'],
      USDC: ['ERC20', 'TRC20', 'BEP20', 'SOL']
    };
    
    return networks[currency.toUpperCase()] || ['mainnet'];
  }

  // Get network info
  getNetworkInfo(currency, network = 'mainnet') {
    const info = {
      BTC: {
        mainnet: {
          name: 'Bitcoin Mainnet',
          symbol: 'BTC',
          decimals: 8,
          explorer: 'https://blockstream.info',
          rpc: null
        },
        testnet: {
          name: 'Bitcoin Testnet',
          symbol: 'BTC',
          decimals: 8,
          explorer: 'https://blockstream.info/testnet',
          rpc: null
        }
      },
      ETH: {
        mainnet: {
          name: 'Ethereum Mainnet',
          symbol: 'ETH',
          decimals: 18,
          explorer: 'https://etherscan.io',
          rpc: process.env.ETHEREUM_RPC_URL
        },
        ropsten: {
          name: 'Ethereum Ropsten',
          symbol: 'ETH',
          decimals: 18,
          explorer: 'https://ropsten.etherscan.io',
          rpc: process.env.ROPSTEN_RPC_URL
        }
      }
    };
    
    return info[currency.toUpperCase()]?.[network] || null;
  }
}

module.exports = new BlockchainService();