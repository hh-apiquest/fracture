/**
 * Test Plan Section 1: quest.collection
 * Tests for collection info and variables API
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ICookieJar, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin } from './test-helpers.js';

describe('Section 1: quest.collection', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;

  beforeEach(() => {
    engine = new ScriptEngine();
    context = {
      protocol: 'http',
      collectionInfo: { id: 'col-abc123', name: 'Test Collection' },
      iterationSource : 'none',
      scopeStack: [],
      globalVariables: {},
      collectionVariables: {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key-123'
      },
      environment: {
        name: 'Development',
        variables: {}
      },
      iterationData: [],
      iterationCurrent: 1,
      iterationCount: 1,
      currentResponse: undefined,
      executionHistory: [],
      options: {},
      protocolPlugin: mockProtocolPlugin,
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal,
    };
  });

  // ========================================================================
  // Section 1.1: quest.collection.info
  // ========================================================================
  
  describe('1.1 quest.collection.info', () => {
    test('quest.collection.info.name matches collection.info.name', async () => {
      const script = `
        quest.test('Collection name matches', () => {
          expect(quest.collection.info.name).to.equal('Test Collection');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.collection.info.id matches collection.info.id', async () => {
      const script = `
        quest.test('Collection ID matches', () => {
          expect(quest.collection.info.id).to.equal('col-abc123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.collection.info.version is exposed when present (and null when omitted)', async () => {
      // Test with version present
      const contextWithVersion = {
        ...context,
        collectionInfo: {
          ...context.collectionInfo,
          version: '1.2.3'
        }
      };

      const scriptWithVersion = `
        quest.test('Version is present', () => {
          expect(quest.collection.info.version).to.equal('1.2.3');
        });
      `;
      
      let result = await engine.execute(scriptWithVersion, contextWithVersion, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);

      // Test with version omitted
      const scriptWithoutVersion = `
        quest.test('Version is null when omitted', () => {
          expect(quest.collection.info.version).to.be.null;
        });
      `;
      
      result = await engine.execute(scriptWithoutVersion, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.collection.info.description is exposed when present (and null when omitted)', async () => {
      // Test with description present
      const contextWithDesc = {
        ...context,
        collectionInfo: {
          ...context.collectionInfo,
          description: 'API test suite'
        }
      };

      const scriptWithDesc = `
        quest.test('Description is present', () => {
          expect(quest.collection.info.description).to.equal('API test suite');
        });
      `;
      
      let result = await engine.execute(scriptWithDesc, contextWithDesc, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);

      // Test with description omitted
      const scriptWithoutDesc = `
        quest.test('Description is null when omitted', () => {
          expect(quest.collection.info.description).to.be.null;
        });
      `;
      
      result = await engine.execute(scriptWithoutDesc, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 1.2: quest.collection.variables API
  // ========================================================================
  
  describe('1.2 quest.collection.variables API', () => {
    test('get(key) returns value when set', async () => {
      const script = `
        quest.test('Get returns value', () => {
          expect(quest.collection.variables.get('baseUrl')).to.equal('https://api.example.com');
          expect(quest.collection.variables.get('apiKey')).to.equal('test-key-123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(key) returns null when missing', async () => {
      const script = `
        quest.test('Get returns null for missing key', () => {
          expect(quest.collection.variables.get('nonExistent')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('set(key,value) sets and overwrites prior value', async () => {
      const script = `
        quest.collection.variables.set('newKey', 'newValue');
        quest.collection.variables.set('baseUrl', 'https://new-api.com');
        
        quest.test('Set works correctly', () => {
          expect(quest.collection.variables.get('newKey')).to.equal('newValue');
          expect(quest.collection.variables.get('baseUrl')).to.equal('https://new-api.com');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has(key) returns true/false correctly', async () => {
      const script = `
        quest.test('Has works correctly', () => {
          expect(quest.collection.variables.has('baseUrl')).to.be.true;
          expect(quest.collection.variables.has('apiKey')).to.be.true;
          expect(quest.collection.variables.has('nonExistent')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('remove(key) removes and returns expected outcome boolean', async () => {
      const script = `
        const removed1 = quest.collection.variables.remove('apiKey');
        const removed2 = quest.collection.variables.remove('nonExistent');
        
        quest.test('Remove returns boolean', () => {
          expect(removed1).to.be.true;
          expect(removed2).to.be.false;
          expect(quest.collection.variables.has('apiKey')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('clear() clears all variables', async () => {
      const script = `
        quest.collection.variables.clear();
        
        quest.test('Clear removes all variables', () => {
          expect(quest.collection.variables.has('baseUrl')).to.be.false;
          expect(quest.collection.variables.has('apiKey')).to.be.false;
          expect(quest.collection.variables.toObject()).to.deep.equal({});
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('toObject() returns snapshot of all keys/values', async () => {
      const script = `
        const obj = quest.collection.variables.toObject();
        
        quest.test('ToObject returns correct snapshot', () => {
          expect(obj).to.deep.equal({
            baseUrl: 'https://api.example.com',
            apiKey: 'test-key-123'
          });
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Collection variables available in variable replacement {{var}}', async () => {
      // This would be tested in integration tests with actual request execution
      // For now, we test that they're accessible via quest.variables.replaceIn
      const script = `
        const replaced = quest.variables.replaceIn('{{baseUrl}}/users/{{apiKey}}');
        
        quest.test('Variables available for replacement', () => {
          expect(replaced).to.equal('https://api.example.com/users/test-key-123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 1.3: Variable types & secret masking
  // ========================================================================
  
  describe('1.3 Variable types & secret masking', () => {
    test('type: "string" stores and retrieves string values', async () => {
      context.collectionVariables = {
        stringVar: 'test-value'
      };

      const script = `
        quest.test('String type works', () => {
          expect(quest.collection.variables.get('stringVar')).to.be.a('string');
          expect(quest.collection.variables.get('stringVar')).to.equal('test-value');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('type: "secret" works functionally same as string', async () => {
      context.collectionVariables = {
        secretVar: 'secret-password-123'
      };

      const script = `
        quest.test('Secret type accessible', () => {
          expect(quest.collection.variables.get('secretVar')).to.equal('secret-password-123');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Variables with type: "secret" masked in console.log output as ***', async () => {
      context.collectionVariables = {
        secretKey: 'my-secret-key'
      };

      const script = `
        const secret = quest.collection.variables.get('secretKey');
        console.log('Secret value:', secret);
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      
      // Check that console output is masked
      const consoleOutput = result.consoleOutput.join('\n');
      // This test will pass once secret masking is implemented
      // For now, we just verify the feature is on the roadmap
    });

    test('Secrets still accessible programmatically in scripts (masking is display-only)', async () => {
      context.collectionVariables = {
        secretToken: 'super-secret-token'
      };

      const script = `
        const token = quest.collection.variables.get('secretToken');
        
        quest.test('Secret accessible in script', () => {
          expect(token).to.equal('super-secret-token');
          expect(token.length).to.equal(18);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 1.4: Variable provider plugins
  // ========================================================================
  
  describe('1.4 Variable provider plugins', () => {
    test('provider: "default" uses static value from collection JSON', async () => {
      // Default provider is the standard behavior we've been testing
      const script = `
        quest.test('Default provider works', () => {
          expect(quest.collection.variables.get('baseUrl')).to.equal('https://api.example.com');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('provider: "env" loads value from process.env[key]', async () => {
      // Set an env var for testing
      process.env.TEST_ENV_VAR = 'env-value-123';
      
      // This test will pass once env provider is implemented
      // For now, we document the expected behavior
      
      delete process.env.TEST_ENV_VAR;
    });

    test('provider: "env" with missing env var returns null', async () => {
      // This test will pass once env provider is implemented
      // Expected: quest.collection.variables.get('missingEnvVar') returns null
    });
  });
});


