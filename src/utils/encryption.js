const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const logger = require('./logger');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.key = process.env.ENCRYPTION_KEY || this.generateDefaultKey();
  }

  // Generate default encryption key
  generateDefaultKey() {
    const key = crypto.randomBytes(32).toString('hex');
    logger.warn('Using generated encryption key. Set ENCRYPTION_KEY in .env for production.');
    return key;
  }

  // Generate key from password
  generateKeyFromPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  // Encrypt data
  encrypt(data) {
    try {
      if (typeof data === 'object') {
        data = JSON.stringify(data);
      }

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.key, 'hex'), iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      logger.error(`Encryption error: ${error.message}`);
      throw error;
    }
  }

  // Decrypt data
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        Buffer.from(this.key, 'hex'),
        Buffer.from(iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Try to parse as JSON
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      logger.error(`Decryption error: ${error.message}`);
      throw error;
    }
  }

  // Encrypt private key
  encryptPrivateKey(privateKey, password) {
    try {
      const salt = crypto.randomBytes(16).toString('hex');
      const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        salt,
        algorithm: 'aes-256-cbc-pbkdf2'
      };
    } catch (error) {
      logger.error(`Encrypt private key error: ${error.message}`);
      throw error;
    }
  }

  // Decrypt private key
  decryptPrivateKey(encryptedData, password) {
    try {
      const { encrypted, iv, salt } = encryptedData;
      const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error(`Decrypt private key error: ${error.message}`);
      throw error;
    }
  }

  // Hash data
  hash(data, algorithm = 'sha256') {
    try {
      const hash = crypto.createHash(algorithm);
      hash.update(data);
      return hash.digest('hex');
    } catch (error) {
      logger.error(`Hash error: ${error.message}`);
      throw error;
    }
  }

  // Generate HMAC
  generateHMAC(data, secret) {
    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(data);
      return hmac.digest('hex');
    } catch (error) {
      logger.error(`Generate HMAC error: ${error.message}`);
      throw error;
    }
  }

  // Generate random string
  generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Generate UUID
  generateUUID() {
    return crypto.randomUUID();
  }

  // Encrypt data for database storage
  encryptForStorage(data) {
    try {
      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(data),
        process.env.DB_ENCRYPTION_KEY || this.key
      ).toString();
      
      return encrypted;
    } catch (error) {
      logger.error(`Encrypt for storage error: ${error.message}`);
      throw error;
    }
  }

  // Decrypt data from database
  decryptFromStorage(encryptedData) {
    try {
      const bytes = CryptoJS.AES.decrypt(
        encryptedData,
        process.env.DB_ENCRYPTION_KEY || this.key
      );
      
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error(`Decrypt from storage error: ${error.message}`);
      throw error;
    }
  }

  // Mask sensitive data
  maskData(data, visibleChars = 4) {
    if (!data || typeof data !== 'string') return data;
    
    if (data.length <= visibleChars * 2) {
      return '*'.repeat(data.length);
    }
    
    const firstPart = data.substring(0, visibleChars);
    const lastPart = data.substring(data.length - visibleChars);
    const maskedPart = '*'.repeat(data.length - visibleChars * 2);
    
    return `${firstPart}${maskedPart}${lastPart}`;
  }

  // Validate encryption key
  validateKey(key) {
    if (!key) return false;
    
    try {
      // Try to encrypt and decrypt test data
      const testData = 'test';
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      
      return decrypted === testData;
    } catch {
      return false;
    }
  }

  // Generate encryption key pair
  generateKeyPair() {
    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });
      
      return { publicKey, privateKey };
    } catch (error) {
      logger.error(`Generate key pair error: ${error.message}`);
      throw error;
    }
  }

  // Encrypt with public key
  encryptWithPublicKey(data, publicKey) {
    try {
      const buffer = Buffer.from(data, 'utf8');
      const encrypted = crypto.publicEncrypt(publicKey, buffer);
      return encrypted.toString('base64');
    } catch (error) {
      logger.error(`Encrypt with public key error: ${error.message}`);
      throw error;
    }
  }

  // Decrypt with private key
  decryptWithPrivateKey(encryptedData, privateKey) {
    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt(privateKey, buffer);
      return decrypted.toString('utf8');
    } catch (error) {
      logger.error(`Decrypt with private key error: ${error.message}`);
      throw error;
    }
  }

  // Generate digital signature
  generateSignature(data, privateKey) {
    try {
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      sign.end();
      return sign.sign(privateKey, 'base64');
    } catch (error) {
      logger.error(`Generate signature error: ${error.message}`);
      throw error;
    }
  }

  // Verify digital signature
  verifySignature(data, signature, publicKey) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      verify.end();
      return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
      logger.error(`Verify signature error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new EncryptionService();