import { IValueProviderPlugin, ValidationResult, ValidationError, ExecutionContext, ILogger } from '@apiquest/types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Encrypted file format
 */
interface EncryptedFile {
  _encrypted: 'aes-256-gcm';
  _iv: string;
  _authTag: string;
  _data: string;
}

/**
 * Plugin configuration
 */
interface VaultFileConfig {
  filePath: string;
  key?: string;
  source?: 'env';
}

/**
 * File-based Vault Provider Plugin
 * Reads secrets from a JSON file (plain or AES-256-GCM encrypted)
 * 
 * Configuration:
 * - filePath: Path to JSON file containing secrets
 * - key: Encryption key or name of environment variable (when source="env")
 * - source: "env" to read key from process.env[key], omit to use key directly
 * 
 * Usage - Unencrypted:
 * {
 *   "plugins": {
 *     "vault:file": {
 *       "filePath": "./secrets.json"
 *     }
 *   }
 * }
 * 
 * Usage - Encrypted with env var:
 * {
 *   "plugins": {
 *     "vault:file": {
 *       "filePath": "./secrets.json.enc",
 *       "key": "VAULT_KEY",
 *       "source": "env"
 *     }
 *   }
 * }
 * 
 * Usage - Encrypted with variable resolution:
 * {
 *   "variables": [{"key": "vaultKey", "value": "my-secret"}],
 *   "plugins": {
 *     "vault:file": {
 *       "filePath": "./secrets.json.enc",
 *       "key": "{{vaultKey}}"
 *     }
 *   }
 * }
 * 
 * Plain secrets.json format:
 * {
 *   "apiKey": "secret-value",
 *   "database": {
 *     "password": "db-password"
 *   }
 * }
 * 
 * Encrypted secrets.json.enc format:
 * {
 *   "_encrypted": "aes-256-gcm",
 *   "_iv": "base64_encoded_iv",
 *   "_authTag": "base64_encoded_auth_tag",
 *   "_data": "base64_encoded_encrypted_json"
 * }
 * 
 * Access nested keys with dot notation: "database.password"
 */
export class FileVaultProvider implements IValueProviderPlugin {
  provider = 'vault:file';
  name = 'File Vault Provider';
  description = 'Load secrets from a JSON file (supports AES-256-GCM encryption)';

  configSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to JSON file containing secrets'
      },
      key: {
        type: 'string',
        description: 'Encryption key or environment variable name'
      },
      source: {
        type: 'string',
        enum: ['env'],
        description: 'Set to "env" to read key from process.env'
      }
    },
    required: ['filePath']
  };

  private cache = new Map<string, unknown>();

  async getValue(
    key: string,
    config?: unknown,
    context?: ExecutionContext,
    logger?: ILogger
  ): Promise<string | null> {
    if (config === undefined || config === null || typeof config !== 'object') {
      logger?.error('Vault file configuration missing');
      throw new Error('FileVaultProvider: filePath not configured in options.plugins["vault:file"]');
    }

    const configObj = config as VaultFileConfig;

    if (!('filePath' in configObj) || typeof configObj.filePath !== 'string') {
      logger?.error('Vault filePath missing in configuration');
      throw new Error('FileVaultProvider: filePath not configured in options.plugins["vault:file"]');
    }

    const filePath = path.resolve(configObj.filePath);
    const cacheKey = filePath;

    // Cache load
    if (!this.cache.has(cacheKey)) {
      try {
        logger?.debug('Loading vault file', { filePath });
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const fileData = JSON.parse(fileContent) as unknown;

        if (this.isEncryptedFile(fileData)) {
          const encryptionKey = this.resolveEncryptionKey(configObj);
          if (encryptionKey === null || encryptionKey === undefined || encryptionKey === '') {
            logger?.error('Encrypted vault file missing encryption key');
            throw new Error('FileVaultProvider: Encrypted vault file requires encryption key (config.key)');
          }

          const decrypted = this.decryptFile(fileData, encryptionKey);
          this.cache.set(cacheKey, decrypted);
          logger?.debug('Encrypted vault file decrypted and cached');
        } else {
          this.cache.set(cacheKey, fileData);
          logger?.debug('Vault file cached');
        }
      } catch (error: unknown) {
        if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          logger?.error('Vault file not found', { filePath });
          throw new Error(`FileVaultProvider: Vault file not found: ${filePath}`);
        }
        if (error instanceof SyntaxError) {
          logger?.error('Vault file JSON parsing failed', { filePath });
          throw new Error(`FileVaultProvider: Invalid JSON in vault file: ${filePath}`);
        }
        throw error;
      }
    }

    const secrets = this.cache.get(cacheKey);
    const value = this.getNestedValue(secrets, key);

    if (value === undefined) {
      logger?.trace('Vault key not found', { key });
      return null;
    }

    logger?.trace('Vault key resolved', { key });
    return String(value);
  }

  validate(config?: unknown): ValidationResult {
    if (config === undefined || config === null) {
      return {
        valid: false,
        errors: [{
          message: 'Configuration required: must specify filePath',
          location: '',
          source: 'vault'
        }]
      };
    }

    // Type guard to check if config is an object and has filePath
    if (typeof config !== 'object' || config === null) {
      return {
        valid: false,
        errors: [{
          message: 'Configuration must be an object',
          location: '',
          source: 'vault'
        }]
      };
    }

    const configObj = config as Record<string, unknown>;

    if (!('filePath' in configObj) || configObj.filePath === undefined || configObj.filePath === null) {
      return {
        valid: false,
        errors: [{
          message: 'filePath is required in configuration',
          location: '',
          source: 'vault'
        }]
      };
    }

    if (typeof configObj.filePath !== 'string') {
      return {
        valid: false,
        errors: [{
          message: 'filePath must be a string',
          location: '',
          source: 'vault'
        }]
      };
    }

    // Check if file exists
    const filePath = path.resolve(configObj.filePath);
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        errors: [{
          message: `Vault file not found: ${filePath}`,
          location: '',
          source: 'vault'
        }]
      };
    }

    // Try to parse JSON and check encryption
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as unknown;
      
      // If file is encrypted, validate we have a key
      if (this.isEncryptedFile(data)) {
        const vaultConfig: VaultFileConfig = {
          filePath: String(configObj.filePath),
          key: typeof configObj.key === 'string' ? configObj.key : undefined,
          source: configObj.source === 'env' ? 'env' : undefined
        };
        const encryptionKey = this.resolveEncryptionKey(vaultConfig);
        
        if (encryptionKey === null || encryptionKey === undefined || encryptionKey === '') {
          return {
            valid: false,
            errors: [{
              message: 'Encrypted vault file requires encryption key (config.key)',
              location: '',
              source: 'vault'
            }]
          };
        }
        
        // Try to decrypt to validate key
        try {
          this.decryptFile(data, encryptionKey);
        } catch (decryptError: unknown) {
          const errorMessage = decryptError instanceof Error ? decryptError.message : 'Decryption failed';
          return {
            valid: false,
            errors: [{
              message: `Failed to decrypt vault file: ${errorMessage}`,
              location: '',
              source: 'vault'
            }]
          };
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        errors: [{
          message: `Invalid JSON in vault file: ${errorMessage}`,
          location: '',
          source: 'vault'
        }]
      };
    }

    return { valid: true };
  }

  /**
   * Resolve the encryption key from config
   * - If source="env", read from process.env[config.key]
   * - Otherwise, use config.key directly
   */
  private resolveEncryptionKey(config: VaultFileConfig): string | null {
    if (config.key === undefined || config.key === null || config.key === '') {
      return null;
    }

    if (config.source === 'env') {
      // Read from environment variable
      const envValue = process.env[config.key];
      return envValue ?? null;
    }

    // Use key directly (could be resolved variable like {{vaultKey}})
    return config.key;
  }

  /**
   * Check if data is an encrypted file
   */
  private isEncryptedFile(data: unknown): data is EncryptedFile {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    
    const obj = data as Record<string, unknown>;
    return '_encrypted' in obj && obj._encrypted === 'aes-256-gcm';
  }

  /**
   * Decrypt an encrypted file using AES-256-GCM
   */
  private decryptFile(encryptedFile: EncryptedFile, key: string): unknown {
    try {
      // Derive a 32-byte key from the provided key using SHA-256
      const keyBuffer = crypto.createHash('sha256').update(key).digest();
      
      // Decode base64 values
      const iv = Buffer.from(encryptedFile._iv, 'base64');
      const authTag = Buffer.from(encryptedFile._authTag, 'base64');
      const encryptedData = Buffer.from(encryptedFile._data, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);
      
      // Parse JSON
      return JSON.parse(decrypted.toString('utf-8')) as unknown;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to decrypt vault file: ${errorMessage}`);
    }
  }

  /**
   * Encrypt data to create an encrypted file (utility method for generating encrypted files)
   */
  static encryptData(data: unknown, key: string): EncryptedFile {
    // Derive a 32-byte key from the provided key using SHA-256
    const keyBuffer = crypto.createHash('sha256').update(key).digest();
    
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);
    
    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    
    // Encrypt
    const jsonData = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(jsonData, 'utf-8'),
      cipher.final()
    ]);
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Return encrypted file format
    return {
      _encrypted: 'aes-256-gcm',
      _iv: iv.toString('base64'),
      _authTag: authTag.toString('base64'),
      _data: encrypted.toString('base64')
    };
  }

  /**
   * Get nested value from object using dot notation
   * Example: getNestedValue({ a: { b: { c: 'value' } } }, 'a.b.c') => 'value'
   */
  private getNestedValue(obj: unknown, key: string): unknown {
    const keys = key.split('.');
    let current = obj;

    for (const k of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[k];
    }

    return current;
  }

  /**
   * Clear the cache (useful for testing or forcing reload)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const fileVaultProvider = new FileVaultProvider();

// Default export
export default fileVaultProvider;
