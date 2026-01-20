const crypto = require('crypto');
const logger = require('../utils/logger');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    // Key must be exactly 32 bytes (256 bits)
    this.key = process.env.ENCRYPTION_KEY 
      ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') 
      : this.generateDefaultKey();
  }

  // Generate fallback key for dev (not for production!)
  generateDefaultKey() {
    const key = crypto.randomBytes(32);
    logger.warn('WARNING: Using a temporary encryption key. Set ENCRYPTION_KEY in .env');
    return key;
  }

  /**
   * 1. System-wide Data Encryption (AES-GCM)
   * Best for database fields like emails or phone numbers
   */
  encrypt(data) {
    try {
      const stringData = typeof data === 'object' ? JSON.stringify(data) : String(data);
      const iv = crypto.randomBytes(12); // GCM standard IV length is 12 bytes
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(stringData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag().toString('hex');

      // Return a single string formatted for DB storage: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
      logger.error(`Encryption error: ${error.message}`);
      throw new Error('Encryption failed');
    }
  }

  decrypt(combinedString) {
    try {
      const [ivHex, authTagHex, encryptedData] = combinedString.split(':');
      
      const decipher = crypto.createDecipheriv(
        this.algorithm, 
        this.key, 
        Buffer.from(ivHex, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      logger.error(`Decryption error: ${error.message}`);
      return null;
    }
  }

  /**
   * 2. User-Specific Private Key Protection
   * Uses PBKDF2 to derive a key from the user's password + salt
   */
  async encryptWithPassword(data, password) {
    try {
      const salt = crypto.randomBytes(16).toString('hex');
      // 100k iterations is standard for balancing security and speed
      const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
      const iv = crypto.randomBytes(12);
      
      const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return {
        encrypted,
        salt,
        iv: iv.toString('hex'),
        authTag: cipher.getAuthTag().toString('hex')
      };
    } catch (error) {
      logger.error(`Password encryption error: ${error.message}`);
      throw error;
    }
  }

  /**
   * 3. Utility Methods
   */
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  maskData(data, visible = 4) {
    if (!data || data.length < visible * 2) return '****';
    return `${data.slice(0, visible)}...${data.slice(-visible)}`;
  }

  generateUUID() {
    return crypto.randomUUID();
  }
}

module.exports = new EncryptionService();