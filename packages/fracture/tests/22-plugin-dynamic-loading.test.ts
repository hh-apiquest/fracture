/**
 * Test Plan Section 22: Plugin Loading
 * Tests CollectionRunner plugin loading via 'resolved' metadata and 'modules' instances
 *
 * Architecture note:
 * - PluginResolver.scanDirectories() is a separate utility — scanning is a caller concern
 * - CollectionRunner accepts plugins via:
 *   - mode: 'resolved' — pre-scanned ResolvedPlugin[] list
 *   - mode: 'modules' — live IProtocolPlugin / IAuthPlugin / IValueProviderPlugin instances
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import { PluginResolver } from '../src/PluginResolver.js';
import type { Collection, IProtocolPlugin, Request, RuntimeOptions } from '@apiquest/types';
import { LogLevel } from '@apiquest/types';
import { mkdir, writeFile, rm, mkdtemp } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { isNullOrEmpty } from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create a minimal IProtocolPlugin for use in tests
 */
function makeProtocolPlugin(protocol: string, body = 'Test plugin works'): IProtocolPlugin {
  return {
    name: `Test Plugin (${protocol})`,
    version: '1.0.0',
    description: 'Minimal plugin for tests',
    protocols: [protocol],
    supportedAuthTypes: [],
    dataSchema: {},
    protocolAPIProvider(context) {
      const data = (context.currentResponse?.data ?? {}) as {
        status?: number;
        statusText?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      return {
        request: {
          url: (context.currentRequest?.data.url ?? '') as string,
          method: (context.currentRequest?.data.method ?? '') as string,
          headers: {
            toObject() { return (context.currentRequest?.data.headers ?? {}) as Record<string, string>; }
          }
        },
        response: {
          status: data.status ?? 0,
          statusText: data.statusText ?? '',
          headers: {
            toObject() { return data.headers ?? {}; }
          },
          body: data.body ?? ''
        }
      };
    },
    validate(_request: Request, _options: RuntimeOptions) { return { valid: true }; },
    async execute() {
      return {
        data: { status: 200, statusText: 'OK', headers: {}, body },
        summary: { outcome: 'success' as const, code: 200, label: 'OK', duration: 0 }
      };
    }
  };
}

describe('Section 22: Plugin Loading', () => {
  let testPluginsDir: string;
  const testPluginsDirPrefix = path.join(__dirname, 'test-plugins-temp-');

  beforeEach(async () => {
    testPluginsDir = await mkdtemp(testPluginsDirPrefix);
  });

  afterEach(async () => {
    if (isNullOrEmpty(testPluginsDir)) return;
    try {
      await rm(testPluginsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ========================================================================
  // Section 22.1: Modules mode — live plugin instances
  // ========================================================================

  describe('22.1 Modules mode: live plugin instances', () => {
    test('Runs collection with protocol plugin provided as module', async () => {
      const plugin = makeProtocolPlugin('test', 'Module mode works');
      const runner = new CollectionRunner({
        logLevel: LogLevel.DEBUG,
        plugins: { mode: 'modules', protocol: [plugin] }
      });

      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'test',
        items: [{ type: 'request', id: 'req-1', name: 'R1', data: { url: 'test://x' } }]
      };

      const result = await runner.run(collection);

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].success).toBe(true);
      expect((result.requestResults[0].response?.data as { body?: string }).body).toBe('Module mode works');
    });

    test('Runs collection with empty modules list — fails on missing plugin', async () => {
      const runner = new CollectionRunner({
        logLevel: LogLevel.DEBUG,
        plugins: { mode: 'modules' }
      });

      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'http',
        items: [{ type: 'request', id: 'req-1', name: 'R1', data: { url: 'http://x' } }]
      };

      await expect(runner.run(collection)).rejects.toThrow("No plugin registered for protocol 'http'");
    });

    test('Multiple protocol plugins — each served by its own instance', async () => {
      const httpPlugin = makeProtocolPlugin('http', 'HTTP response');
      const grpcPlugin = makeProtocolPlugin('grpc', 'GRPC response');

      const runner = new CollectionRunner({
        plugins: { mode: 'modules', protocol: [httpPlugin, grpcPlugin] }
      });

      const httpResult = await runner.run({
        info: { id: 'c1', name: 'C1' },
        protocol: 'http',
        items: [{ type: 'request', id: 'r1', name: 'R1', data: { url: 'http://x' } }]
      });
      expect((httpResult.requestResults[0].response?.data as { body?: string }).body).toBe('HTTP response');

      const grpcResult = await runner.run({
        info: { id: 'c2', name: 'C2' },
        protocol: 'grpc',
        items: [{ type: 'request', id: 'r2', name: 'R2', data: { url: 'grpc://x' } }]
      });
      expect((grpcResult.requestResults[0].response?.data as { body?: string }).body).toBe('GRPC response');
    });
  });

  // ========================================================================
  // Section 22.2: Resolved mode — pre-scanned metadata
  // ========================================================================

  describe('22.2 Resolved mode: pre-scanned metadata via PluginResolver', () => {
    test('Loads fracture protocol plugin from resolved metadata', async () => {
      // Create test plugin directory structure
      const pluginDir = path.join(testPluginsDir, 'plugin-test-protocol');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-test-protocol',
        version: '1.0.0',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: { provides: { protocols: ['test'] } }
        }
      }, null, 2));

      await writeFile(path.join(distDir, 'index.js'), `
        export default {
          name: 'Test Plugin', version: '1.0.0', description: 'Test',
          protocols: ['test'], supportedAuthTypes: [], dataSchema: {},
          protocolAPIProvider() { return { request: {}, response: {} }; },
          validate() { return { valid: true }; },
          async execute() {
            return { data: { status: 200, statusText: 'OK', headers: {}, body: 'Resolved mode works' },
                     summary: { outcome: 'success', code: 200, label: 'OK', duration: 0 } };
          }
        };
      `);

      // Scan once externally — caller concern
      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);
      expect(resolved).toHaveLength(1);

      // Pass resolved list to runner — no second scan
      const runner = new CollectionRunner({
        logLevel: LogLevel.DEBUG,
        plugins: { mode: 'resolved', resolved }
      });

      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'test',
        items: [{ type: 'request', id: 'req-1', name: 'R1', data: { url: 'test://x' } }]
      };

      const result = await runner.run(collection);

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].success).toBe(true);
      expect((result.requestResults[0].response?.data as { body?: string }).body).toBe('Resolved mode works');
    });

    test('Skips plugins without fracture runtime during scanning', async () => {
      const pluginDir = path.join(testPluginsDir, 'plugin-desktop-only');
      await mkdir(pluginDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-desktop-only',
        main: 'dist/index.js',
        apiquest: { type: 'protocol', runtime: ['desktop'] }
      }, null, 2));

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      // Desktop-only plugin should not be resolved
      expect(resolved).toHaveLength(0);
    });

    test('Loads auth plugin from resolved metadata', async () => {
      const pluginDir = path.join(testPluginsDir, 'plugin-test-auth');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-test-auth',
        version: '1.0.0',
        main: 'dist/index.js',
        apiquest: {
          type: 'auth',
          runtime: ['fracture'],
          capabilities: { provides: { authTypes: ['testauth'] } }
        }
      }, null, 2));

      await writeFile(path.join(distDir, 'index.js'), `
        export default [
          {
            name: 'Test Auth', version: '1.0.0', description: 'Test',
            authTypes: ['testauth'], protocols: ['http'], dataSchema: {},
            validate() { return { valid: true }; },
            async apply(request) { return request; }
          }
        ];
      `);

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);
      expect(resolved.some(r => r.name === '@apiquest/plugin-test-auth')).toBe(true);

      const httpPlugin = makeProtocolPlugin('http');
      // http already supports all auth types with strictAuthList=false default
      (httpPlugin as { supportedAuthTypes: string[] }).supportedAuthTypes = ['testauth'];

      const runner = new CollectionRunner({
        logLevel: LogLevel.DEBUG,
        plugins: { mode: 'resolved', resolved }
      });
      // Pre-register protocol plugin directly since it's not in resolved list
      runner.registerPlugin(httpPlugin);

      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'http',
        items: [{
          type: 'request', id: 'req-1', name: 'R1',
          auth: { type: 'testauth', data: {} },
          data: { url: 'http://example.com' }
        }]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].success).toBe(true);
    });
  });

  // ========================================================================
  // Section 22.3: PluginResolver unit tests
  // ========================================================================

  describe('22.3 PluginResolver unit tests', () => {
    test('Handles non-existent directory gracefully', async () => {
      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories(['/nonexistent/path']);
      expect(resolved).toHaveLength(0);
    });

    test('Scans empty directory and returns empty list', async () => {
      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);
      expect(resolved).toHaveLength(0);
    });

    test('Ignores non-plugin directories', async () => {
      await mkdir(path.join(testPluginsDir, 'not-a-plugin'), { recursive: true });
      await mkdir(path.join(testPluginsDir, 'also-not-plugin'), { recursive: true });

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);
      expect(resolved).toHaveLength(0);
    });

    test('Resolves plugin with valid capabilities metadata', async () => {
      const pluginDir = path.join(testPluginsDir, 'plugin-full');
      await mkdir(pluginDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-full',
        version: '1.2.3',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: { provides: { protocols: ['custom', 'custom2'] } }
        }
      }, null, 2));

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].name).toBe('@apiquest/plugin-full');
      expect(resolved[0].version).toBe('1.2.3');
      expect(resolved[0].protocols).toEqual(['custom', 'custom2']);
    });

    test('Handles version conflicts — newer version wins', async () => {
      const pluginV1Dir = path.join(testPluginsDir, 'plugin-versioned-v1');
      const pluginV2Dir = path.join(testPluginsDir, 'plugin-versioned-v2');
      await mkdir(pluginV1Dir, { recursive: true });
      await mkdir(pluginV2Dir, { recursive: true });

      await writeFile(path.join(pluginV1Dir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-versioned', version: '1.0.0', main: 'dist/index.js',
        apiquest: { type: 'protocol', runtime: ['fracture'], capabilities: { provides: { protocols: ['versioned'] } } }
      }, null, 2));

      await writeFile(path.join(pluginV2Dir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-versioned', version: '2.0.0', main: 'dist/index.js',
        apiquest: { type: 'protocol', runtime: ['fracture'], capabilities: { provides: { protocols: ['versioned'] } } }
      }, null, 2));

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      // Only one entry, it should be the newest version
      const versioned = resolved.filter(r => r.name === '@apiquest/plugin-versioned');
      expect(versioned).toHaveLength(1);
      expect(versioned[0].version).toBe('2.0.0');
    });

    test('Handles invalid package.json during resolution — skips bad, continues good', async () => {
      // Bad JSON plugin
      const badDir = path.join(testPluginsDir, 'plugin-bad-json');
      await mkdir(badDir, { recursive: true });
      await writeFile(path.join(badDir, 'package.json'), '{ invalid json syntax');

      // Valid plugin
      const goodDir = path.join(testPluginsDir, 'plugin-good-json');
      await mkdir(goodDir, { recursive: true });
      await writeFile(path.join(goodDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-good-json', version: '1.0.0', main: 'dist/index.js',
        apiquest: { type: 'protocol', runtime: ['fracture'], capabilities: { provides: { protocols: ['good'] } } }
      }, null, 2));

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      // Only good plugin should be resolved
      expect(resolved).toHaveLength(1);
      expect(resolved[0].name).toBe('@apiquest/plugin-good-json');
    });

    test('Resolves auth plugin with authTypes in capabilities', async () => {
      const pluginDir = path.join(testPluginsDir, 'plugin-bearer-auth');
      await mkdir(pluginDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-bearer-auth', version: '1.0.0', main: 'dist/index.js',
        apiquest: { type: 'auth', runtime: ['fracture'], capabilities: { provides: { authTypes: ['bearer', 'token'] } } }
      }, null, 2));

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].type).toBe('auth');
      expect(resolved[0].authTypes).toEqual(['bearer', 'token']);
    });

    test('Resolves value provider plugin', async () => {
      const pluginDir = path.join(testPluginsDir, 'plugin-vault-custom');
      await mkdir(pluginDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-vault-custom', version: '1.0.0', main: 'dist/index.js',
        apiquest: { type: 'value', runtime: ['fracture'], capabilities: { provides: { valueTypes: ['vault:custom'] } } }
      }, null, 2));

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].type).toBe('value');
      expect(resolved[0].valueTypes).toEqual(['vault:custom']);
    });
  });

  // ========================================================================
  // Section 22.4: Error handling during plugin loading
  // ========================================================================

  describe('22.4 Error handling during plugin loading', () => {
    test('Fails to run when required plugin throws during import', async () => {
      const pluginDir = path.join(testPluginsDir, 'plugin-bad');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-bad', version: '1.0.0', main: 'dist/index.js',
        apiquest: { type: 'protocol', runtime: ['fracture'], capabilities: { provides: { protocols: ['bad'] } } }
      }, null, 2));

      await writeFile(path.join(distDir, 'index.js'), `throw new Error('Plugin loading failed!');`);

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      const runner = new CollectionRunner({
        logLevel: LogLevel.DEBUG,
        plugins: { mode: 'resolved', resolved }
      });

      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'bad',
        items: [{ type: 'request', id: 'req-1', name: 'R1', data: { url: 'bad://x' } }]
      };

      await expect(runner.run(collection)).rejects.toThrow();
    });

    test('Handles missing entrypoint file', async () => {
      const pluginDir = path.join(testPluginsDir, 'plugin-missing');
      await mkdir(pluginDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-missing', version: '1.0.0', main: 'dist/index.js',
        apiquest: { type: 'protocol', runtime: ['fracture'], capabilities: { provides: { protocols: ['missing'] } } }
      }, null, 2));
      // Note: dist/index.js is NOT created

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      const runner = new CollectionRunner({
        logLevel: LogLevel.DEBUG,
        plugins: { mode: 'resolved', resolved }
      });

      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'missing',
        items: [{ type: 'request', id: 'req-1', name: 'R1', data: { url: 'missing://x' } }]
      };

      await expect(runner.run(collection)).rejects.toThrow();
    });
  });

  // ========================================================================
  // Section 22.5: Mixed registration — modules + registerPlugin()
  // ========================================================================

  describe('22.5 Mixed registration', () => {
    test('Registers additional plugin via registerPlugin() after construction', async () => {
      const basePlugin = makeProtocolPlugin('base', 'Base plugin');
      const extraPlugin = makeProtocolPlugin('extra', 'Extra plugin');

      const runner = new CollectionRunner({
        plugins: { mode: 'modules', protocol: [basePlugin] }
      });
      runner.registerPlugin(extraPlugin);

      const extraResult = await runner.run({
        info: { id: 'test', name: 'Test' },
        protocol: 'extra',
        items: [{ type: 'request', id: 'r1', name: 'R1', data: { url: 'extra://x' } }]
      });

      expect((extraResult.requestResults[0].response?.data as { body?: string }).body).toBe('Extra plugin');
    });

    test('Resolved mode: registers additional plugin via registerPlugin() before run()', async () => {
      // Create a plugin in directory for resolved mode
      const pluginDir = path.join(testPluginsDir, 'plugin-dynamic');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });

      await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
        name: '@apiquest/plugin-dynamic', version: '1.0.0', main: 'dist/index.js',
        apiquest: { type: 'protocol', runtime: ['fracture'], capabilities: { provides: { protocols: ['dynamic'] } } }
      }, null, 2));

      await writeFile(path.join(distDir, 'index.js'), `
        export default {
          name: 'Dynamic Plugin', version: '1.0.0', description: 'Dynamic',
          protocols: ['dynamic'], supportedAuthTypes: [], dataSchema: {},
          protocolAPIProvider() { return { request: {}, response: {} }; },
          validate() { return { valid: true }; },
          async execute() {
            return { data: { status: 200, statusText: 'OK', headers: {}, body: 'Dynamic' },
                     summary: { outcome: 'success', code: 200, label: 'OK', duration: 0 } };
          }
        };
      `);

      const resolver = new PluginResolver();
      const resolved = await resolver.scanDirectories([testPluginsDir]);

      const staticPlugin = makeProtocolPlugin('static', 'Static');

      const runner = new CollectionRunner({
        plugins: { mode: 'resolved', resolved }
      });
      runner.registerPlugin(staticPlugin);

      // Test static plugin (registered explicitly)
      const staticResult = await runner.run({
        info: { id: 'c1', name: 'C1' },
        protocol: 'static',
        items: [{ type: 'request', id: 'r1', name: 'R1', data: { url: 'static://x' } }]
      });
      expect((staticResult.requestResults[0].response?.data as { body?: string }).body).toBe('Static');

      // Test dynamic plugin (loaded from resolved)
      const dynamicResult = await runner.run({
        info: { id: 'c2', name: 'C2' },
        protocol: 'dynamic',
        items: [{ type: 'request', id: 'r2', name: 'R2', data: { url: 'dynamic://x' } }]
      });
      expect((dynamicResult.requestResults[0].response?.data as { body?: string }).body).toBe('Dynamic');
    });
  });
});
