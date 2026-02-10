import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '../src/PluginManager.js';
import { FileVaultProvider } from '../../plugin-vault-file/src/index.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Variable Provider Plugin Integration', () => {
  let pluginManager: PluginManager;
  let vaultProvider: FileVaultProvider;
  const testSecretsPath = path.join(__dirname, 'test-vault-secrets.json');

  beforeEach(() => {
    pluginManager = new PluginManager();
    vaultProvider = new FileVaultProvider();
    
    // Create test vault file
    const secrets = {
      apiKey: 'vault-secret-123',
      database: {
        password: 'db-pass-456'
      }
    };
    fs.writeFileSync(testSecretsPath, JSON.stringify(secrets, null, 2));
    
    // Register provider
    pluginManager.registerVariableProvider(vaultProvider);
  });

  afterEach(() => {
    vaultProvider.clearCache();
    if (fs.existsSync(testSecretsPath)) {
      fs.unlinkSync(testSecretsPath);
    }
  });

  test('should register vault provider', () => {
    const provider = pluginManager.getVariableProvider('vault:file');
    expect(provider).toBeDefined();
    expect(provider?.provider).toBe('vault:file');
  });

  test('should retrieve value through plugin manager', async () => {
    const value = await pluginManager.resolveVariableProvider(
      'vault:file',
      'apiKey',
      { filePath: testSecretsPath }
    );
    
    expect(value).toBe('vault-secret-123');
  });

  test('should retrieve nested value through plugin manager', async () => {
    const value = await pluginManager.resolveVariableProvider(
      'vault:file',
      'database.password',
      { filePath: testSecretsPath }
    );
    
    expect(value).toBe('db-pass-456');
  });

  test('should throw error for unregistered provider', async () => {
    await expect(
      pluginManager.resolveVariableProvider(
        'vault:aws',
        'key',
        {}
      )
    ).rejects.toThrow('No variable provider plugin registered');
  });

  test('should return null for non-existent key', async () => {
    const value = await pluginManager.resolveVariableProvider(
      'vault:file',
      'nonExistent',
      { filePath: testSecretsPath }
    );
    
    expect(value).toBe(null);
  });

  test('should throw error when provider fails', async () => {
    await expect(
      pluginManager.resolveVariableProvider(
        'vault:file',
        'key',
        { filePath: './non-existent.json' }
      )
    ).rejects.toThrow('Variable provider error');
  });

  test('should list all registered providers', () => {
    const providers = pluginManager.getAllVariableProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].provider).toBe('vault:file');
  });
});

