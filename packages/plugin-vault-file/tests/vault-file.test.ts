import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { FileVaultProvider } from '../src/index.js';
import * as fs from 'fs';
import * as path from 'path';

describe('FileVaultProvider', () => {
  let provider: FileVaultProvider;
  const testSecretsPath = path.join(__dirname, 'test-secrets.json');
  const encryptedSecretsPath = path.join(__dirname, 'test-secrets.enc.json');
  const testSecrets = {
    apiKey: 'secret-api-key-123',
    database: {
      host: 'localhost',
      password: 'db-password-456',
      credentials: {
        username: 'admin',
        token: 'nested-token-789'
      }
    },
    oauth: {
      clientId: 'client-123',
      clientSecret: 'secret-456'
    }
  };

  beforeEach(() => {
    provider = new FileVaultProvider();
    // Create test secrets file
    fs.writeFileSync(testSecretsPath, JSON.stringify(testSecrets, null, 2));
  });

  afterEach(() => {
    // Clean up
    provider.clearCache();
    if (fs.existsSync(testSecretsPath)) {
      fs.unlinkSync(testSecretsPath);
    }
    if (fs.existsSync(encryptedSecretsPath)) {
      fs.unlinkSync(encryptedSecretsPath);
    }
  });

  describe('Configuration', () => {
    test('should have correct provider type', () => {
      expect(provider.provider).toBe('vault:file');
    });

    test('should have name and description', () => {
      expect(provider.name).toBe('File Vault Provider');
      expect(provider.description).toContain('AES-256-GCM');
    });

    test('should have config schema', () => {
      expect(provider.configSchema).toBeDefined();
      expect(provider.configSchema.properties.filePath).toBeDefined();
      expect(provider.configSchema.properties.key).toBeDefined();
      expect(provider.configSchema.properties.source).toBeDefined();
      expect(provider.configSchema.required).toContain('filePath');
    });
  });

  describe('Validation', () => {
    test('should fail validation when config is missing', () => {
      const result = provider.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toContain('Configuration required');
    });

    test('should fail validation when filePath is missing', () => {
      const result = provider.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('filePath is required');
    });

    test('should fail validation when filePath is not a string', () => {
      const result = provider.validate({ filePath: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('filePath must be a string');
    });

    test('should fail validation when file does not exist', () => {
      const result = provider.validate({ filePath: './non-existent.json' });
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('not found');
    });

    test('should fail validation when file has invalid JSON', () => {
      const invalidPath = path.join(__dirname, 'invalid.json');
      fs.writeFileSync(invalidPath, '{ invalid json }');
      
      const result = provider.validate({ filePath: invalidPath });
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('Invalid JSON');
      
      fs.unlinkSync(invalidPath);
    });

    test('should pass validation with valid config', () => {
      const result = provider.validate({ filePath: testSecretsPath });
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('getValue - Top-level keys', () => {
    test('should retrieve top-level string value', async () => {
      const value = await provider.getValue('apiKey', { filePath: testSecretsPath });
      expect(value).toBe('secret-api-key-123');
    });

    test('should return null for non-existent key', async () => {
      const value = await provider.getValue('nonExistent', { filePath: testSecretsPath });
      expect(value).toBe(null);
    });

    test('should throw error when filePath is not configured', async () => {
      await expect(provider.getValue('apiKey', {})).rejects.toThrow('filePath not configured');
    });

    test('should throw error when file does not exist', async () => {
      await expect(
        provider.getValue('apiKey', { filePath: './non-existent.json' })
      ).rejects.toThrow('Vault file not found');
    });
  });

  describe('getValue - Nested keys with dot notation', () => {
    test('should retrieve nested value (1 level deep)', async () => {
      const value = await provider.getValue('database.host', { filePath: testSecretsPath });
      expect(value).toBe('localhost');
    });

    test('should retrieve nested value (2 levels deep)', async () => {
      const value = await provider.getValue('database.password', { filePath: testSecretsPath });
      expect(value).toBe('db-password-456');
    });

    test('should retrieve deeply nested value (3 levels)', async () => {
      const value = await provider.getValue('database.credentials.username', { filePath: testSecretsPath });
      expect(value).toBe('admin');
    });

    test('should retrieve deeply nested token', async () => {
      const value = await provider.getValue('database.credentials.token', { filePath: testSecretsPath });
      expect(value).toBe('nested-token-789');
    });

    test('should return null for non-existent nested key', async () => {
      const value = await provider.getValue('database.nonExistent', { filePath: testSecretsPath });
      expect(value).toBe(null);
    });

    test('should return null when intermediate path does not exist', async () => {
      const value = await provider.getValue('nonExistent.nested.key', { filePath: testSecretsPath });
      expect(value).toBe(null);
    });
  });

  describe('Encryption - encryptData utility', () => {
    test('should encrypt data with provided key', () => {
      const key = 'test-encryption-key-32-bytes!';
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);

      expect(encrypted._encrypted).toBe('aes-256-gcm');
      expect(encrypted._iv).toBeDefined();
      expect(encrypted._authTag).toBeDefined();
      expect(encrypted._data).toBeDefined();
      expect(encrypted._iv).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64
      expect(encrypted._authTag).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64
      expect(encrypted._data).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64
    });

    test('should produce different ciphertext each time (random IV)', () => {
      const key = 'test-encryption-key';
      const encrypted1 = FileVaultProvider.encryptData(testSecrets, key);
      const encrypted2 = FileVaultProvider.encryptData(testSecrets, key);

      // IVs should be different
      expect(encrypted1._iv).not.toBe(encrypted2._iv);
      // Ciphertext should be different
      expect(encrypted1._data).not.toBe(encrypted2._data);
    });
  });

  describe('Encryption - Reading encrypted files', () => {
    test('should read and decrypt encrypted file with direct key', async () => {
      const key = 'my-secret-encryption-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      // Read value
      const value = await provider.getValue('apiKey', {
        filePath: encryptedSecretsPath,
        key
      });

      expect(value).toBe('secret-api-key-123');
    });

    test('should read nested values from encrypted file', async () => {
      const key = 'my-secret-encryption-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      // Read nested values
      const password = await provider.getValue('database.password', {
        filePath: encryptedSecretsPath,
        key
      });

      expect(password).toBe('db-password-456');
    });

    test('should read from environment variable when source=env', async () => {
      const key = 'my-secret-encryption-key';
      
      // Set environment variable
      process.env.TEST_VAULT_KEY = key;

      try {
        // Create encrypted file
        const encrypted = FileVaultProvider.encryptData(testSecrets, key);
        fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

        // Read value using env var
        const value = await provider.getValue('apiKey', {
          filePath: encryptedSecretsPath,
          key: 'TEST_VAULT_KEY',
          source: 'env'
        });

        expect(value).toBe('secret-api-key-123');
      } finally {
        delete process.env.TEST_VAULT_KEY;
      }
    });

    test('should fail when encrypted file has no key provided', async () => {
      const key = 'my-secret-encryption-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      // Try to read without key
      await expect(
        provider.getValue('apiKey',{ filePath: encryptedSecretsPath })
      ).rejects.toThrow('requires encryption key');
    });

    test('should fail with wrong encryption key', async () => {
      const correctKey = 'correct-key';
      const wrongKey = 'wrong-key';
      
      // Create encrypted file with correct key
      const encrypted = FileVaultProvider.encryptData(testSecrets, correctKey);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      // Try to read with wrong key
      await expect(
        provider.getValue('apiKey', {
          filePath: encryptedSecretsPath,
          key: wrongKey
        })
      ).rejects.toThrow('Failed to decrypt');
    });

    test('should cache decrypted data', async () => {
      const key = 'my-secret-encryption-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      // First read
      const value1 = await provider.getValue('apiKey', {
        filePath: encryptedSecretsPath,
        key
      });

      // Modify file (but cache should still be used)
      const newEncrypted = FileVaultProvider.encryptData({ apiKey: 'NEW' }, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(newEncrypted, null, 2));

      // Second read should return cached value
      const value2 = await provider.getValue('apiKey', {
        filePath: encryptedSecretsPath,
        key
      });

      expect(value1).toBe('secret-api-key-123');
      expect(value2).toBe('secret-api-key-123'); // Still cached
    });

    test('should decrypt fresh data after clearing cache', async () => {
      const key = 'my-secret-encryption-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      // First read
      await provider.getValue('apiKey', {
        filePath: encryptedSecretsPath,
        key
      });

      // Modify file
      const newEncrypted = FileVaultProvider.encryptData({ apiKey: 'NEW-KEY' }, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(newEncrypted, null, 2));

      // Clear cache
      provider.clearCache();

      // Should read new value
      const value = await provider.getValue('apiKey', {
        filePath: encryptedSecretsPath,
        key
      });

      expect(value).toBe('NEW-KEY');
    });
  });

  describe('Encryption - Validation', () => {
    test('should validate encrypted file with correct key', () => {
      const key = 'correct-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      const result = provider.validate({
        filePath: encryptedSecretsPath,
        key
      });

      expect(result.valid).toBe(true);
    });

    test('should fail validation for encrypted file without key', () => {
      const key = 'encryption-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, key);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      const result = provider.validate({
        filePath: encryptedSecretsPath
      });

      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('requires encryption key');
    });

    test('should fail validation for encrypted file with wrong key', () => {
      const correctKey = 'correct-key';
      const wrongKey = 'wrong-key';
      
      // Create encrypted file
      const encrypted = FileVaultProvider.encryptData(testSecrets, correctKey);
      fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

      const result = provider.validate({
        filePath: encryptedSecretsPath,
        key: wrongKey
      });

      expect(result.valid).toBe(false);
      expect(result.errors?.[0].message).toContain('Failed to decrypt');
    });

    test('should validate encrypted file with env var key', () => {
      const key = 'env-encryption-key';
      process.env.TEST_VALIDATION_KEY = key;

      try {
        // Create encrypted file
        const encrypted = FileVaultProvider.encryptData(testSecrets, key);
        fs.writeFileSync(encryptedSecretsPath, JSON.stringify(encrypted, null, 2));

        const result = provider.validate({
          filePath: encryptedSecretsPath,
          key: 'TEST_VALIDATION_KEY',
          source: 'env'
        });

        expect(result.valid).toBe(true);
      } finally {
        delete process.env.TEST_VALIDATION_KEY;
      }
    });
  });

  describe('Caching behavior', () => {
    test('should cache file contents after first read', async () => {
      // First read
      const value1 = await provider.getValue('apiKey', { filePath: testSecretsPath });
      expect(value1).toBe('secret-api-key-123');

      // Modify file
      const modified = { ...testSecrets, apiKey: 'modified-key' };
      fs.writeFileSync(testSecretsPath, JSON.stringify(modified));

      // Second read should still return cached value
      const value2 = await provider.getValue('apiKey', { filePath: testSecretsPath });
      expect(value2).toBe('secret-api-key-123'); // Still cached
    });

    test('should use fresh data after cache clear', async () => {
      // First read
      await provider.getValue('apiKey', { filePath: testSecretsPath });

      // Modify file
      const modified = { ...testSecrets, apiKey: 'modified-key' };
      fs.writeFileSync(testSecretsPath, JSON.stringify(modified));

      // Clear cache
      provider.clearCache();

      // Should read new value
      const value = await provider.getValue('apiKey', { filePath: testSecretsPath });
      expect(value).toBe('modified-key');
    });
  });

  describe('Type conversion', () => {
    test('should convert number to string', async () => {
      const numberPath = path.join(__dirname, 'numbers.json');
      fs.writeFileSync(numberPath, JSON.stringify({ port: 5432 }));

      const value = await provider.getValue('port', { filePath: numberPath });
      expect(value).toBe('5432');
      expect(typeof value).toBe('string');

      fs.unlinkSync(numberPath);
    });

    test('should convert boolean to string', async () => {
      const boolPath = path.join(__dirname, 'bool.json');
      fs.writeFileSync(boolPath, JSON.stringify({ enabled: true, disabled: false }));

      const value1 = await provider.getValue('enabled', { filePath: boolPath });
      expect(value1).toBe('true');

      const value2 = await provider.getValue('disabled', { filePath: boolPath });
      expect(value2).toBe('false');

      fs.unlinkSync(boolPath);
    });
  });

  describe('Error handling', () => {
    test('should handle invalid JSON gracefully', async () => {
      const invalidPath = path.join(__dirname, 'invalid.json');
      fs.writeFileSync(invalidPath, '{ invalid json }');

      await expect(
        provider.getValue('key', { filePath: invalidPath })
      ).rejects.toThrow('Invalid JSON');

      fs.unlinkSync(invalidPath);
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle OAuth credentials', async () => {
      const clientId = await provider.getValue('oauth.clientId', { filePath: testSecretsPath });
      const clientSecret = await provider.getValue('oauth.clientSecret', { filePath: testSecretsPath });

      expect(clientId).toBe('client-123');
      expect(clientSecret).toBe('secret-456');
    });

    test('should handle database connection strings', async () => {
      const host = await provider.getValue('database.host', { filePath: testSecretsPath });
      const password = await provider.getValue('database.password', { filePath: testSecretsPath });

      expect(host).toBe('localhost');
      expect(password).toBe('db-password-456');
    });

    test('should work with multiple different vault files', async () => {
      // Create second vault file
      const vault2Path = path.join(__dirname, 'vault2.json');
      fs.writeFileSync(vault2Path, JSON.stringify({ key: 'value2' }));

      const value1 = await provider.getValue('apiKey', { filePath: testSecretsPath });
      const value2 = await provider.getValue('key', { filePath: vault2Path });

      expect(value1).toBe('secret-api-key-123');
      expect(value2).toBe('value2');

      fs.unlinkSync(vault2Path);
    });

    test('should handle encrypted production secrets', async () => {
      const prodKey = 'production-encryption-key-very-secure';
      const prodSecrets = {
        aws: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        },
        stripe: {
          publicKey: 'pk_live_...',
          secretKey: 'sk_live_...'
        }
      };

      const prodPath = path.join(__dirname, 'prod.enc.json');
      const encrypted = FileVaultProvider.encryptData(prodSecrets, prodKey);
      fs.writeFileSync(prodPath, JSON.stringify(encrypted, null, 2));

      const awsKey = await provider.getValue('aws.accessKeyId', {
        filePath: prodPath,
        key: prodKey
      });

      const stripeSecret = await provider.getValue('stripe.secretKey', {
        filePath: prodPath,
        key: prodKey
      });

      expect(awsKey).toBe('AKIAIOSFODNN7EXAMPLE');
      expect(stripeSecret).toBe('sk_live_...');

      fs.unlinkSync(prodPath);
    });
  });

  describe('Readonly enforcement', () => {
    test('should not provide any setValue method', () => {
      expect((provider as unknown as Record<string, unknown>).setValue).toBeUndefined();
    });

    test('should only expose getValue, validate, and clearCache', () => {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(provider));
      const publicMethods = methods.filter(m => !m.startsWith('_') && m !== 'constructor');
      
      expect(publicMethods).toContain('getValue');
      expect(publicMethods).toContain('validate');
      expect(publicMethods).toContain('clearCache');
      expect(publicMethods).not.toContain('setValue');
      expect(publicMethods).not.toContain('updateValue');
      expect(publicMethods).not.toContain('deleteValue');
    });
  });
});
