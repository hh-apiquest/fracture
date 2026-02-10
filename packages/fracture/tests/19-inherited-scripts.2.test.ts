/**
 * Test Plan Section 17.8 (Part 19.2): Variable Scoping & Isolation
 * Batches 5-6: Variable persistence and isolation across inherited scripts
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 19.2: Variable Scoping & Isolation', () => {
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
  });

  // ========================================================================
  // Batch 5: Variable scoping - persistence (10 tests)
  // ========================================================================
  
  describe('19.5 Variable scoping - persistence', () => {
    test('Collection variables persist across all inherited scripts', async () => {
      const collection: Collection = {
        info: { id: 'col-24', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        variables: { colVar: 'persistent' },
        preRequestScript: `
          // Verify collection var and set marker
          if (quest.collection.variables.get('colVar') === 'persistent') {
            quest.global.variables.set('colPreVerified', 'yes');
          }
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              // Verify collection var and set marker
              if (quest.collection.variables.get('colVar') === 'persistent') {
                quest.global.variables.set('folderPreVerified', 'yes');
              }
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  // Verify collection var and set marker
                  if (quest.collection.variables.get('colVar') === 'persistent') {
                    quest.global.variables.set('reqPreVerified', 'yes');
                  }
                `,
                postRequestScript: `
                  quest.test('Collection var in all script layers', () => {
                    expect(quest.collection.variables.get('colVar')).to.equal('persistent');
                    expect(quest.global.variables.get('colPreVerified')).to.equal('yes');
                    expect(quest.global.variables.get('folderPreVerified')).to.equal('yes');
                    expect(quest.global.variables.get('reqPreVerified')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests.every(t => t.passed)).toBe(true);
    });

    test('Global variables persist across all inherited scripts', async () => {
      const collection: Collection = {
        info: { id: 'col-25', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.global.variables.set('globalPersist', 'value');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              // Verify global var and set marker
              if (quest.global.variables.get('globalPersist') === 'value') {
                quest.global.variables.set('folderPreSawGlobal', 'yes');
              }
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.test('Global visible in all scripts', () => {
                    expect(quest.global.variables.get('globalPersist')).to.equal('value');
                    expect(quest.global.variables.get('folderPreSawGlobal')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests.every(t => t.passed)).toBe(true);
    });

    test('Environment variables accessible in all inherited scripts', async () => {
      const collection: Collection = {
        info: { id: 'col-26', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          // Verify env var and set marker
          if (quest.environment.variables.get('testEnv') === 'envValue') {
            quest.global.variables.set('colPreSawEnv', 'yes');
          }
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              // Verify env var and set marker
              if (quest.environment.variables.get('testEnv') === 'envValue') {
                quest.global.variables.set('folderPreSawEnv', 'yes');
              }
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.test('Env in all scripts', () => {
                    expect(quest.environment.variables.get('testEnv')).to.equal('envValue');
                    expect(quest.global.variables.get('colPreSawEnv')).to.equal('yes');
                    expect(quest.global.variables.get('folderPreSawEnv')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        environment: {
          name: 'Test',
          variables: { testEnv: 'envValue' }
        }
      });
      expect(result.requestResults[0].tests.every(t => t.passed)).toBe(true);
    });

    test('Local cleared AFTER request (not between script layers)', async () => {
      const collection: Collection = {
        info: { id: 'col-27', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.scope.variables.set('layerTest', 'fromCol');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              // Verify scope var from col.pre and set marker
              if (quest.scope.variables.get('layerTest') === 'fromCol') {
                quest.global.variables.set('folderPreSawColScope', 'yes');
              }
              quest.scope.variables.set('folderAdd', 'added');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  // Verify both scope vars and set marker
                  if (quest.scope.variables.get('layerTest') === 'fromCol' &&
                      quest.scope.variables.get('folderAdd') === 'added') {
                    quest.global.variables.set('reqPreSawBoth', 'yes');
                  }
                `,
                postRequestScript: `
                  quest.test('Scope persists through script layers', () => {
                    expect(quest.scope.variables.get('layerTest')).to.equal('fromCol');
                    expect(quest.scope.variables.get('folderAdd')).to.equal('added');
                    expect(quest.global.variables.get('folderPreSawColScope')).to.equal('yes');
                    expect(quest.global.variables.get('reqPreSawBoth')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests.every(t => t.passed)).toBe(true);
    });

    test('Local from collection.preRequest visible in folder.preRequest', async () => {
      const collection: Collection = {
        info: { id: 'col-28', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        preRequestScript: `
          quest.scope.variables.set('colToFolder', 'success');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              // Verify scope var from col.pre and set marker
              if (quest.scope.variables.get('colToFolder') === 'success') {
                quest.global.variables.set('folderSawColScope', 'yes');
              }
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.test('Collection preRequest scope visible in folder', () => {
                    expect(quest.global.variables.get('folderSawColScope')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });

    test('Local from folder.preRequest visible in request.preRequest', async () => {
      const collection: Collection = {
        info: { id: 'col-29', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            preRequestScript: `
              quest.scope.variables.set('folderToReq', 'passed');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  // Verify folder scope var and set marker
                  if (quest.scope.variables.get('folderToReq') === 'passed') {
                    quest.global.variables.set('reqSawFolderScope', 'yes');
                  }
                `,
                postRequestScript: `
                  quest.test('Folder preRequest scope visible in request', () => {
                    expect(quest.global.variables.get('reqSawFolderScope')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });

    test('Local from request scripts visible in folder.postRequest', async () => {
      const collection: Collection = {
        info: { id: 'col-30', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            postRequestScript: `
              quest.test('Can see request local in folder.post', () => {
                expect(quest.scope.variables.get('reqLocal')).to.equal('visible');
              });
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  quest.scope.variables.set('reqLocal', 'visible');
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
    });

    test('Scope cleared between different requests', async () => {
      const collection: Collection = {
        info: { id: 'col-31', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.scope.variables.set('req1Scope', 'fromReq1');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            preRequestScript: `
              // Verify Request 1 scope is NOT visible and set marker
              const isNull = quest.scope.variables.get('req1Scope') === null;
              quest.global.variables.set('req1ScopeCleared', isNull ? 'yes' : 'no');
            `,
            postRequestScript: `
              quest.test('Request 1 scope NOT visible', () => {
                expect(quest.global.variables.get('req1ScopeCleared')).to.equal('yes');
              });
            `
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Scope from Request A NOT visible in Request B', async () => {
      const collection: Collection = {
        info: { id: 'col-32', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            items: [
              {
                type: 'request',
                id: 'req-A',
                name: 'Request A',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.scope.variables.set('reqASecret', 'hidden');
                `
              },
              {
                type: 'request',
                id: 'req-B',
                name: 'Request B',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  // Verify Request A scope is NOT visible and set marker
                  const isNull = quest.scope.variables.get('reqASecret') === null;
                  quest.global.variables.set('reqAScopeIsolated', isNull ? 'yes' : 'no');
                `,
                postRequestScript: `
                  quest.test('Request A scope isolated', () => {
                    expect(quest.global.variables.get('reqAScopeIsolated')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Scope from Folder A NOT visible in Folder B', async () => {
      const collection: Collection = {
        info: { id: 'col-33', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-A',
            name: 'Folder A',
            preRequestScript: `
              quest.scope.variables.set('folderAOnly', 'secret');
            `,
            items: [
              {
                type: 'request',
                id: 'req-A',
                name: 'Request A',
                data: { method: 'GET', url: '${serverUrl}/status/200' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-B',
            name: 'Folder B',
            items: [
              {
                type: 'request',
                id: 'req-B',
                name: 'Request B',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  // Verify Folder A scope is NOT visible and set marker
                  const isNull = quest.scope.variables.get('folderAOnly') === null;
                  quest.global.variables.set('folderAScopeIsolated', isNull ? 'yes' : 'no');
                `,
                postRequestScript: `
                  quest.test('Folder A scope NOT visible', () => {
                    expect(quest.global.variables.get('folderAScopeIsolated')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });
  });

  // ========================================================================
  // Batch 6: Variable isolation (4 tests)
  // ========================================================================
  
  describe('19.6 Variable isolation', () => {
    test('Scope from Folder A NOT visible in Folder B requests', async () => {
      const collection: Collection = {
        info: { id: 'col-34', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-A',
            name: 'Folder A',
            items: [
              {
                type: 'request',
                id: 'req-A',
                name: 'Request A',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                postRequestScript: `
                  quest.scope.variables.set('folderAReqScope', 'A');
                `
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-B',
            name: 'Folder B',
            items: [
              {
                type: 'request',
                id: 'req-B',
                name: 'Request B',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  // Verify Folder A request scope is NOT visible and set marker
                  const isNull = quest.scope.variables.get('folderAReqScope') === null;
                  quest.global.variables.set('folderAReqIsolated', isNull ? 'yes' : 'no');
                `,
                postRequestScript: `
                  quest.test('Sibling folder request scope isolated', () => {
                    expect(quest.global.variables.get('folderAReqIsolated')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Scope from Request1 NOT visible in Request2 (same folder)', async () => {
      const collection: Collection = {
        info: { id: 'col-35', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder',
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request 1',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  quest.scope.variables.set('req1only', 'isolated');
                `
              },
              {
                type: 'request',
                id: 'req-2',
                name: 'Request 2',
                data: { method: 'GET', url: '${serverUrl}/status/200' },
                preRequestScript: `
                  // Verify Request 1 scope is NOT visible and set marker
                  const isNull = quest.scope.variables.get('req1only') === null;
                  quest.global.variables.set('req1ScopeIsolated', isNull ? 'yes' : 'no');
                `,
                postRequestScript: `
                  quest.test('Previous request scope NOT visible', () => {
                    expect(quest.global.variables.get('req1ScopeIsolated')).to.equal('yes');
                  });
                `
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Collection vars from Request1 ARE visible in Request2', async () => {
      const collection: Collection = {
        info: { id: 'col-36', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.collection.variables.set('shared', 'value');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            preRequestScript: `
              // Verify collection var is visible and set marker
              const hasValue = quest.collection.variables.get('shared') === 'value';
              quest.global.variables.set('collectionVarPersisted', hasValue ? 'yes' : 'no');
            `,
            postRequestScript: `
              quest.test('Collection var persists across requests', () => {
                expect(quest.global.variables.get('collectionVarPersisted')).to.equal('yes');
              });
            `
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Global vars from Request1 ARE visible in Request2', async () => {
      const collection: Collection = {
        info: { id: 'col-37', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            postRequestScript: `
              quest.global.variables.set('crossRequest', 'visible');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'GET', url: '${serverUrl}/status/200' },
            preRequestScript: `
              // Verify global var is visible and set marker
              const hasValue = quest.global.variables.get('crossRequest') === 'visible';
              quest.global.variables.set('globalVarPersisted', hasValue ? 'yes' : 'no');
            `,
            postRequestScript: `
              quest.test('Global var persists across requests', () => {
                expect(quest.global.variables.get('globalVarPersisted')).to.equal('yes');
              });
            `
          }
        ]
      };

      const result = await runner.run(collection);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });
  });
});


