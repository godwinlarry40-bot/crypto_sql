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
    this.providers = {
      ethereum: new Web3(new Web3.providers.HttpProvider(
        process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/your-key'
      )),
      bitcoin: {
        network: bitcoin.networks.bitcoin,
        explorer: 'https://blockstream.info/api'
      }
    };
  }

  // 1. Unified Wallet Generator
  async generateWallet(currency, network = 'mainnet') {
    try {
      const mnemonic = bip39.generateMnemonic();
      const seed = await bip39.mnemonicToSeed(mnemonic);
      const root = bip32.fromSeed(seed);

      let walletData;
      switch (currency.toUpperCase()) {
        case 'BTC':
          walletData = this._deriveBitcoin(root, network);
          break;
        case 'ETH':
        case 'BNB':
          walletData = this._deriveEthereumLike(root, currency);
          break;
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }

      return { ...walletData, mnemonic };
    } catch (error) {
      logger.error(`Wallet Gen Error: ${error.message}`);
      throw error;
    }
  }

  // 2. Private: Bitcoin Derivation (SegWit/Legacy)
  _deriveBitcoin(root, network) {
    const net = network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    const path = network === 'testnet' ? "m/44'/1'/0'/0/0" : "m/44'/0'/0'/0/0";
    const child = root.derivePath(path);
    
    const { address } = bitcoin.payments.p2pkh({
      pubkey: child.publicKey,
      network: net
    });

    return {
      address,
      privateKey: child.privateKey.toString('hex'),
      currency: 'BTC',
      path
    };
  }

  // 3. Private: Ethereum/BSC Derivation
  _deriveEthereumLike(root, currency) {
    const path = "m/44'/60'/0'/0/0"; // Standard ETH path
    const child = root.derivePath(path);
    const privateKey = '0x' + child.privateKey.toString('hex');
    const account = this.providers.ethereum.eth.accounts.privateKeyToAccount(privateKey);

    return {
      address: account.address,
      privateKey: account.privateKey,
      currency: currency.toUpperCase()
    };
  }

  // 4. Real-time Balance Checker (On-Chain)
  async getOnChainBalance(address, currency) {
    try {
      if (currency === 'ETH') {
        const wei = await this.providers.ethereum.eth.getBalance(address);
        return this.providers.ethereum.utils.fromWei(wei, 'ether');
      }
      if (currency === 'BTC') {
        const res = await axios.get(`${this.providers.bitcoin.explorer}/address/${address}`);
        // Convert Satoshis to BTC
        return (res.data.chain_stats.funded_txo_sum - res.data.chain_stats.spent_txo_sum) / 100000000;
      }
    } catch (error) {
      logger.error(`Balance Fetch Error: ${error.message}`);
      return 0;
    }
  }

  // 5. Transaction Status (Explorer Lookups)
  async getTxStatus(txHash, currency) {
    try {
      if (currency === 'ETH') {
        const receipt = await this.providers.ethereum.eth.getTransactionReceipt(txHash);
        return receipt ? (receipt.status ? 'confirmed' : 'failed') : 'pending';
      }
      // Add BTC logic via Blockstream API...
    } catch (error) {
      return 'unknown';
    }
  }
}

module.exports = new BlockchainService();