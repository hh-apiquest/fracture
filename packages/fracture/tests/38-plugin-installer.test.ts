import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginInstaller } from '../src/cli/plugin-installer.js';
import type { PluginRequirements } from '../src/CollectionAnalyzer.js';
import type { ResolvedPlugin } from '../src/PluginResolver.js';

describe('PluginInstaller', () => {
  describe('findMissingPlugins', () => {
    it('should find missing protocol plugins', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http', 'grpc']),
        authTypes: new Set(),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-http',
          version: '1.0.0',
          type: 'protocol',
          path: '/path',
          entryPoint: 'index.js',
          protocols: ['http']
        }
      ];
      
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-grpc')).toBe(true);
      expect(missing.has('@apiquest/plugin-http')).toBe(false);
      expect(missing.size).toBe(1);
    });
    
    it('should find missing auth plugins', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(['bearer', 'basic']),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [];
      
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-auth')).toBe(true);
      expect(missing.size).toBe(1);
    });
    
    it('should find missing value provider plugins', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(),
        valueProviders: new Set(['vault:file', 'vault:env'])
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-vault-file',
          version: '1.0.0',
          type: 'value',
          path: '/path',
          entryPoint: 'index.js',
          provider: 'vault:file'
        }
      ];
      
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-vault-env')).toBe(true);
      expect(missing.has('@apiquest/plugin-vault-file')).toBe(false);
      expect(missing.size).toBe(1);
    });
    
    it('should return empty set when all plugins are resolved', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http']),
        authTypes: new Set(['bearer']),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-http',
          version: '1.0.0',
          type: 'protocol',
          path: '/path',
          entryPoint: 'index.js',
          protocols: ['http']
        },
        {
          name: '@apiquest/plugin-auth',
          version: '1.0.0',
          type: 'auth',
          path: '/path',
          entryPoint: 'index.js',
          authTypes: ['bearer', 'basic', 'apikey']
        }
      ];
      
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.size).toBe(0);
    });
    
    it('should handle multiple protocols from same plugin', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http', 'https']),
        authTypes: new Set(),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-http',
          version: '1.0.0',
          type: 'protocol',
          path: '/path',
          entryPoint: 'index.js',
          protocols: ['http', 'https']
        }
      ];
      
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.size).toBe(0);
    });
  });
  
  describe('Package name mapping', () => {
    it('should map protocol to correct package name', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http']),
        authTypes: new Set(),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [];
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-http')).toBe(true);
    });
    
    it('should map auth type to plugin-auth package', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(['bearer']),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [];
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-auth')).toBe(true);
    });
    
    it('should map value provider with colon to hyphen', () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(),
        valueProviders: new Set(['vault:file'])
      };
      
      const resolved: ResolvedPlugin[] = [];
      const missing = PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-vault-file')).toBe(true);
    });
  });
});
