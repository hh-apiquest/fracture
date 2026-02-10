/**
 * Test Plan Section 7: quest.environment
 * Tests for environment properties, variables API, and source/precedence
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { FakeJar, mockProtocolPlugin } from './test-helpers.js';

describe('Section 7: quest.environment', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;

  beforeEach(() => {
    engine = new ScriptEngine();
    
    context = {
      protocol: 'http',
      collectionInfo : { id: 'col-123', name: 'Test Collection' },
      iterationSource : 'none',
      scopeStack: [],
      globalVariables: {},
      collectionVariables: {},
      environment: {
        name: 'Production',
        variables: {
          apiUrl: 'https://api.prod.example.com',
          timeout: '30000'
        }
      },
      iterationData: [],
      iterationCurrent: 1,
      iterationCount: 1,
      currentResponse: undefined,
      currentRequest: undefined,
      executionHistory: [],
      options: {},
      protocolPlugin: mockProtocolPlugin,
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal
    };
  });

  // ========================================================================
  // Section 7.1: Properties
  // ========================================================================
  
  describe('7.1 Properties', () => {
    test('quest.environment.name equals environment JSON name', async () => {
      const script = `
        quest.test('Environment name matches', () => {
          expect(quest.environment.name).to.equal('Production');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.environment.name reflects different environment names', async () => {
      context.environment = { name: 'Development', variables: {} };
      
      const script = `
        quest.test('Environment name is Development', () => {
          expect(quest.environment.name).to.equal('Development');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 7.2: Variables API
  // ========================================================================
  
  describe('7.2 Variables API', () => {
    test('get(key) returns value when set', async () => {
      const script = `
        quest.test('Get returns value', () => {
          expect(quest.environment.variables.get('apiUrl')).to.equal('https://api.prod.example.com');
          expect(quest.environment.variables.get('timeout')).to.equal('30000');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(key) returns null when missing', async () => {
      const script = `
        quest.test('Get returns null for missing', () => {
          expect(quest.environment.variables.get('missing')).to.be.null;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('set(key, value) sets variable', async () => {
      const script = `
        quest.environment.variables.set('newVar', 'newValue');
        
        quest.test('Set works', () => {
          expect(quest.environment.variables.get('newVar')).to.equal('newValue');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      
      // Verify it was actually set in context
      expect(context.environment).toBeDefined();
      expect(context.environment!.variables['newVar']).toBe('newValue');
    });

    test('set(key, value) overwrites prior value', async () => {
      const script = `
        quest.environment.variables.set('apiUrl', 'https://api.updated.example.com');
        
        quest.test('Set overwrites', () => {
          expect(quest.environment.variables.get('apiUrl')).to.equal('https://api.updated.example.com');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('has(key) returns true/false', async () => {
      const script = `
        quest.test('Has works correctly', () => {
          expect(quest.environment.variables.has('apiUrl')).to.be.true;
          expect(quest.environment.variables.has('timeout')).to.be.true;
          expect(quest.environment.variables.has('missing')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('remove(key) removes variable', async () => {
      const script = `
        const removed = quest.environment.variables.remove('timeout');
        
        quest.test('Remove works', () => {
          expect(removed).to.be.true;
          expect(quest.environment.variables.has('timeout')).to.be.false;
          expect(quest.environment.variables.has('apiUrl')).to.be.true;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('remove(key) returns false for missing key', async () => {
      const script = `
        const removed = quest.environment.variables.remove('nonExistent');
        
        quest.test('Remove returns false for missing', () => {
          expect(removed).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('clear() removes all variables', async () => {
      const script = `
        quest.environment.variables.clear();
        
        quest.test('Clear removes all', () => {
          expect(quest.environment.variables.has('apiUrl')).to.be.false;
          expect(quest.environment.variables.has('timeout')).to.be.false;
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      
      // Verify context is cleared
      expect(Object.keys(context.environment?.variables ?? {}).length).toBe(0);
    });

    test('toObject() returns snapshot of all variables', async () => {
      const script = `
        const vars = quest.environment.variables.toObject();
        
        quest.test('ToObject returns all', () => {
          expect(vars).to.have.property('apiUrl');
          expect(vars).to.have.property('timeout');
          expect(vars.apiUrl).to.equal('https://api.prod.example.com');
          expect(vars.timeout).to.equal('30000');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Environment created if not present when setting variable', async () => {
      context.environment = undefined;
      
      const script = `
        quest.environment.variables.set('newKey', 'newValue');
        
        quest.test('Environment created on set', () => {
          expect(quest.environment.variables.get('newKey')).to.equal('newValue');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
      
      // Verify environment was created
      expect(context.environment).toBeDefined();
      expect(context.environment!.variables['newKey']).toBe('newValue');
    });
  });

  // ========================================================================
  // Section 7.3: Source + precedence
  // ========================================================================
  
  describe('7.3 Source + precedence', () => {
    test('Environment participates in cascading resolution (quest.variables)', async () => {
      // Set up: env has a value not in other scopes
      context.environment = {
        name: 'Test',
        variables: { envOnly: 'fromEnv' }
      };
      
      const script = `
        quest.test('Cascading resolver finds env variable', () => {
          // quest.variables checks: iteration > local > collection > env > global
          expect(quest.variables.get('envOnly')).to.equal('fromEnv');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Collection variables override environment variables', async () => {
      context.collectionVariables = { apiUrl: 'collectionOverride' };
      context.environment = {
        name: 'Test',
        variables: { apiUrl: 'envValue' }
      };
      
      const script = `
        quest.test('Collection overrides environment', () => {
          // Collection has higher priority than environment
          expect(quest.variables.get('apiUrl')).to.equal('collectionOverride');
          // But env still has its value
          expect(quest.environment.variables.get('apiUrl')).to.equal('envValue');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Environment variables override global variables', async () => {
      context.environment = {
        name: 'Test',
        variables: { sharedKey: 'fromEnv' }
      };
      context.globalVariables = { sharedKey: 'fromGlobal' };
      
      const script = `
        quest.test('Environment overrides global', () => {
          // Environment has higher priority than global
          expect(quest.variables.get('sharedKey')).to.equal('fromEnv');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Scope variables override environment variables', async () => {
      // Set up scope stack with a variable
      context.scopeStack = [{
        level: 'request',
        id: 'test-req',
        vars: { tempKey: 'fromScope' }
      }];
      context.environment = {
        name: 'Test',
        variables: { tempKey: 'fromEnv' }
      };
      
      const script = `
        quest.test('Scope overrides environment', () => {
          expect(quest.variables.get('tempKey')).to.equal('fromScope');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Environment loads from CLI --environment file (integration)', async () => {
      // This would be handled by runner/CLI loading the environment file
      // For unit test, we simulate the loaded environment
      context.environment = {
        name: 'Staging',
        variables: {
          apiUrl: 'https://api.staging.example.com',
          dbHost: 'db.staging.local'
        }
      };
      
      const script = `
        quest.test('Environment loaded from file', () => {
          expect(quest.environment.name).to.equal('Staging');
          expect(quest.environment.variables.get('apiUrl')).to.equal('https://api.staging.example.com');
          expect(quest.environment.variables.get('dbHost')).to.equal('db.staging.local');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


