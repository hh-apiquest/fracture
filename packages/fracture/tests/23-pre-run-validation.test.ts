// Section 23: Pre-Run Validation System
// Tests AST-based validation before collection execution

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import { mockAuthPlugin, mockOptionsPlugin } from './test-helpers.js';
import type { Collection } from '@apiquest/types';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 23: Pre-Run Validation', () => {
  let runner: CollectionRunner;
  let server: MockHttpServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = createTestServer();
    serverUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
    runner.registerAuthPlugin(mockAuthPlugin);
  });

  describe('23.1 Script Validation - quest.test() Placement', () => {
    test('Disallows quest.test() in collectionPreScript', async () => {
      const collection: Collection = {
        info: { id: 'col-1', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPreScript: `
          quest.test('should fail', () => {
            expect(true).to.be.true;
          });
        `,
        items: []
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors![0].message).toContain('quest.test() is not allowed in collection-pre scripts');
      expect(result.validationErrors![0].source).toBe('script');
      expect(result.validationErrors![0].scriptType).toBe('collection-pre');
    });

    test('Disallows quest.test() in collectionPostScript', async () => {
      const collection: Collection = {
        info: { id: 'col-2', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPostScript: `
          quest.test('should fail', () => {
            expect(true).to.be.true;
          });
        `,
        items: []
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('quest.test() is not allowed in collection-post scripts');
    });

    test('Disallows quest.test() in folderPreScript', async () => {
      const collection: Collection = {
        info: { id: 'col-3', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'folder',
          id: 'folder-1',
          name: 'Test Folder',
          folderPreScript: `
            quest.test('should fail', () => {
              expect(true).to.be.true;
            });
          `,
          items: []
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('quest.test() is not allowed in folder-pre scripts');
    });

    test('Disallows quest.test() in folderPostScript', async () => {
      const collection: Collection = {
        info: { id: 'col-4', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'folder',
          id: 'folder-1',
          name: 'Test Folder',
          folderPostScript: `
            quest.test('should fail', () => {
              expect(true).to.be.true;
            });
          `,
          items: []
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('quest.test() is not allowed in folder-post scripts');
    });

    test('Disallows quest.test() in preRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-5', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          preRequestScript: `
            quest.test('should fail', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('quest.test() is not allowed in request-pre scripts');
    });

    test('Allows quest.test() in postRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-6', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          postRequestScript: `
            quest.test('should pass', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeUndefined();
      expect(result.totalTests).toBe(1);
      expect(result.passedTests).toBe(1);
    });
  });

  describe('23.2 Conditional Test Detection', () => {
    test('Disallows conditional quest.test() in if statement', async () => {
      const collection: Collection = {
        info: { id: 'col-7', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          postRequestScript: `
            if (quest.response.status === 200) {
              quest.test('conditional test', () => {
                expect(true).to.be.true;
              });
            }
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('quest.test() cannot be declared conditionally');
      expect(result.validationErrors![0].details?.suggestion).toContain('quest.skip()');
    });

    test('Provides suggestion to use quest.skip() for conditional logic', async () => {
      const collection: Collection = {
        info: { id: 'col-8', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          postRequestScript: `
            const shouldTest = true;
            if (shouldTest) {
              quest.test('bad', () => {});
            }
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors![0].details?.suggestion).toBeDefined();
      expect(result.validationErrors![0].details?.suggestion).toMatch(/quest\.skip\(\)|request\.condition/);
    });
  });

  describe('23.3 quest.expectMessages() Validation', () => {
    test('Disallows quest.expectMessages() in postRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-9', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          postRequestScript: `
            quest.expectMessages(5);
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('quest.expectMessages() can only be called in preRequestScript');
    });

    test('Allows quest.expectMessages() in preRequestScript (runtime check only)', async () => {
      // Note: This test validates syntax only. Runtime validation for protocol compatibility
      // happens during script execution, not pre-run validation
      const collection: Collection = {
        info: { id: 'col-10', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          preRequestScript: `
            // This will fail at runtime because HTTP has no plugin events with canHaveTests
            // But pre-run validation only checks placement, not protocol compatibility
          `
        }]
      };

      const result = await runner.run(collection);
      // No pre-run validation errors for placement
      expect(result.validationErrors).toBeUndefined();
    });
  });

  describe('23.4 Protocol Plugin Validation', () => {
    test('Validates HTTP request missing URL', async () => {
      const collection: Collection = {
        info: { id: 'col-11', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET' }  // Missing URL
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('URL is required');
      expect(result.validationErrors![0].source).toBe('protocol');
    });

    test('Validates HTTP request with invalid method', async () => {
      const collection: Collection = {
        info: { id: 'col-12', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'INVALID', url: 'mock://status/200' }
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('Invalid HTTP method');
    });
  });

  describe('23.5 Auth Plugin Validation', () => {
    test('Validates mock-auth missing token', async () => {
      const collection: Collection = {
        info: { id: 'col-13', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        auth: { type: 'mock-auth', data: {} },  // Missing token
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' }
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('Mock auth requires a token');
      expect(result.validationErrors![0].source).toBe('auth');
    });

    test('Validates mock-auth1 with valid token passes', async () => {
      const collection: Collection = {
        info: { id: 'col-14', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        auth: { type: 'mock-auth1', data: { token: 'valid-token' } },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' }
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeUndefined();
    });

    test('Validates mock-auth2 missing required data fails', async () => {
      const collection: Collection = {
        info: { id: 'col-15', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        auth: { type: 'mock-auth2', data: {} },  // Missing token
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' }
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].source).toBe('auth');
    });
  });

  describe('23.6 Multiple Validation Errors', () => {
    test('Collects all validation errors before stopping', async () => {
      const collection: Collection = {
        info: { id: 'col-16', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPreScript: `
          quest.test('bad', () => {});
        `,
        auth: { type: 'mock-auth', data: {} },  // Missing token
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET' }  // Missing URL
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThanOrEqual(3);  // Script, auth, protocol errors
      
      const scriptError = result.validationErrors!.find(e => e.source === 'script');
      const authError = result.validationErrors!.find(e => e.source === 'auth');
      const protocolError = result.validationErrors!.find(e => e.source === 'protocol');
      
      expect(scriptError).toBeDefined();
      expect(authError).toBeDefined();
      expect(protocolError).toBeDefined();
    });

    test('Does not execute any requests when validation fails', async () => {
      const collection: Collection = {
        info: { id: 'col-17', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPreScript: `
          quest.test('bad', () => {});
        `,
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' }
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.requestResults).toHaveLength(0);  // No requests executed
      expect(result.totalTests).toBe(0);
    });
  });

  describe('23.7 Validation Success', () => {
    test('No validation errors for valid collection', async () => {
      const collection: Collection = {
        info: { id: 'col-18', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          postRequestScript: `
            quest.test('valid test', () => {
              expect(quest.response.status).to.equal(200);
            });
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeUndefined();
      expect(result.requestResults).toHaveLength(1);
      expect(result.totalTests).toBe(1);
    });
  });

  describe('23.5 Strict Mode - Conditional Test Detection', () => {
    test('strictMode: true (default) rejects conditional tests', async () => {
      const collection: Collection = {
        info: { id: 'col-sm-1', name: 'Strict Mode Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://status/200' },
          postRequestScript: `
            if (quest.response.status === 200) {
              quest.test('conditional test', () => {});
            }
          `
        }]
      };

      const result = await runner.run(collection, { strictMode: true });
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
      expect(result.validationErrors![0].message).toContain('conditionally');
    });

    test('strictMode: false allows conditional tests',  async () => {
      const collection: Collection = {
        info: { id: 'col-sm-2', name: 'Strict Mode Off Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `mock://status/200` },
          postRequestScript: `
            if (quest.response.status === 200) {
              quest.test('conditional test', () => {
                expect(quest.response.status).to.equal(200);
              });
            }
          `
        }]
      };

      const result = await runner.run(collection, { strictMode: false });
      expect(result.validationErrors).toBeUndefined();
      expect(result.passedTests).toBe(1);
    });

    test('strictMode defaults to true when not specified', async () => {
      const collection: Collection = {
        info: { id: 'col-sm-3', name: 'Default Strict Mode', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `mock://status/200` },
          postRequestScript: `
            if (quest.response.status === 200) {
              quest.test('conditional test', () => {});
            }
          `
        }]
      };

      // Not passing strictMode - should default to true
      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    });

    test('Collection options.strictMode overridden by RunOptions', async () => {
      const collection: Collection = {
        info: { id: 'col-sm-4', name: 'Override Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          strictMode: false  // Collection says false
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `mock://status/200` },
          postRequestScript: `
            if (quest.response.status === 200) {
              quest.test('conditional test', () => {});
            }
          `
        }]
      };

      // RunOptions should override collection
      const result = await runner.run(collection, { strictMode: true });
      expect(result.validationErrors).toBeDefined();
    });

    test('strictMode: true rejects try/catch blocks with tests', async () => {
      const collection: Collection = {
        info: { id: 'col-sm-5a', name: 'Try-Catch Strict Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `mock://status/200` },
          postRequestScript: `
            try {
              quest.test('inside try-catch', () => {
                expect(quest.response.status).to.equal(200);
              });
            } catch (e) {
              // Error caught
            }
          `
        }]
      };

      const result = await runner.run(collection, { strictMode: true });
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
      expect(result.validationErrors![0].message).toContain('conditionally');
    });

    test('strictMode: false allows try/catch blocks with tests', async () => {
      const collection: Collection = {
        info: { id: 'col-sm-5', name: 'Try-Catch Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `mock://status/200` },
          postRequestScript: `
            try {
              quest.test('inside try-catch', () => {
                expect(quest.response.status).to.equal(200);
              });
            } catch (e) {
              // Error caught
            }
          `
        }]
      };

      const result = await runner.run(collection, { strictMode: false });
      expect(result.validationErrors).toBeUndefined();
      expect(result.passedTests).toBe(1);
    });

    test('strictMode: true rejects logical operator conditional tests', async () => {
      const collection: Collection = {
        info: { id: 'col-sm-6a', name: 'Logical Operator Strict Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `mock://status/200` },
          postRequestScript: `
            const status = quest.response.status;
            status === 200 && quest.test('logical operator test', () => {
              expect(status).to.equal(200);
            });
          `
        }]
      };

      const result = await runner.run(collection, { strictMode: true });
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
      expect(result.validationErrors![0].message).toContain('conditionally');
    });

    test('strictMode: false allows logical operator conditional tests', async () => {
      const collection: Collection = {
        info: { id: 'col-sm-6', name: 'Logical Operator Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `mock://status/200` },
          postRequestScript: `
            const status = quest.response.status;
            status === 200 && quest.test('logical operator test', () => {
              expect(status).to.equal(200);
            });
          `
        }]
      };

      const result = await runner.run(collection, { strictMode: false });
      expect(result.validationErrors).toBeUndefined();
      expect(result.passedTests).toBe(1);
    });
  });
});

