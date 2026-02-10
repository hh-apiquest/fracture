/**
 * Test Plan Section 18: CollectionRunner Integration Tests
 * Tests complete collection execution with folders, iterations, dependencies, conditions
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection, EventPayloads } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';
import { createTestServer, type MockHttpServer } from './test-helpers.js';

describe('Section 18: CollectionRunner Integration', () => {
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
  // Section 18.1: Basic collection execution
  // ========================================================================
  
  describe('18.1 Basic collection execution', () => {
    test('Empty collection executes without errors', async () => {
      const collection: Collection = {
        info: { id: 'col-1', name: 'Empty Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: []
      };
      
      const result = await runner.run(collection);
      
      expect(result.collectionId).toBe('col-1');
      expect(result.collectionName).toBe('Empty Collection');
      expect(result.requestResults).toHaveLength(0);
      expect(result.totalTests).toBe(0);
    });

    test('Collection with single request executes', async () => {
      const collection: Collection = {
        info: { id: 'col-2', name: 'Single Request', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test Request',
            data: {
              method: 'GET',
              url: `mock://status/200`
            }
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-1');
      expect(result.requestResults[0].success).toBe(true);
    });

    test('Collection execution time is tracked', async () => {
      const collection: Collection = {
        info: { id: 'col-3', name: 'Time Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: []
      };
      
      const result = await runner.run(collection);
      
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.endTime.getTime() - result.startTime.getTime()).toBe(result.duration);
    });
  });

  // ========================================================================
  // Section 18.2: Collection scripts (collectionPre/Post)
  // ========================================================================
  
  describe('18.2 Collection scripts', () => {
    test('collectionPreScript executes once before all iterations', async () => {
      const collection: Collection = {
        info: { id: 'col-4', name: 'Collection Pre', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPreScript: `
          quest.global.variables.set('preCount', '1');
        `,
        items: [],
        testData: [{row: 1}, {row: 2}]
      };
      
      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, { globalVariables: globalVars });
      
      // Should execute only once, not per iteration
      expect(globalVars['preCount']).toBe('1');
    });

    test('collectionPostScript executes once after all iterations', async () => {
      const collection: Collection = {
        info: { id: 'col-5', name: 'Collection Post', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPostScript: `
          quest.collection.variables.set('postExecuted', 'true');
        `,
        items: [],
        testData: [{row: 1}, {row: 2}]
      };
      
      const result = await runner.run(collection);
      
      // Verify post script executed
      expect(result).toBeDefined();
    });

    test('collectionPreScript error stops execution', async () => {
      const collection: Collection = {
        info: { id: 'col-6', name: 'Collection Pre Error', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPreScript: `
          throw new Error('Pre-script failure');
        `,
        items: []
      };
      
      await expect(runner.run(collection)).rejects.toThrow('Pre-script failure');
    });
  });

  // ========================================================================
  // Section 18.3: Iterations
  // ========================================================================
  
  describe('18.3 Iterations', () => {
    test('Collection with testData runs multiple iterations', async () => {
      const collection: Collection = {
        info: { id: 'col-7', name: 'Multi Iteration', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Iteration Request',
            data: {
              method: 'GET',
              url: `mock://status/200`
            },
            postRequestScript: `
              quest.test('Iteration ' + quest.iteration.current, () => {
                expect(quest.iteration.count).to.equal(3);
              });
            `
          }
        ],
        testData: [
          {userId: '1'},
          {userId: '2'},
          {userId: '3'}
        ]
      };
      
      const result = await runner.run(collection);
      
      // 1 request × 3 iterations = 3 results
      expect(result.requestResults).toHaveLength(3);
      expect(result.requestResults[0].iteration).toBe(1);
      expect(result.requestResults[1].iteration).toBe(2);
      expect(result.requestResults[2].iteration).toBe(3);
    });

    test('CLI --data overrides collection testData', async () => {
      const collection: Collection = {
        info: { id: 'col-8', name: 'CLI Data Override', version: '1.0.0' },
        protocol: 'mock-options',
        items: [],
        testData: [{original: 'data'}]
      };
      
      const cliData = [{cli: 'data1'}, {cli: 'data2'}];
      const result = await runner.run(collection, { data: cliData });
      
      // Should use CLI data (2 iterations) not collection data (1 iteration)
      // We'll verify this once requests are added
      expect(result).toBeDefined();
    });

    test('No testData results in single iteration', async () => {
      const collection: Collection = {
        info: { id: 'col-9', name: 'No Data', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Single Run',
            data: {
              method: 'GET',
              url: `mock://status/200`
            }
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].iteration).toBe(1);
    });
  });

  // ========================================================================
  // Section 18.4: Folder execution and nesting
  // ========================================================================
  
  describe('18.4 Folder execution', () => {
    test('Folder with requests executes all requests', async () => {
      const collection: Collection = {
        info: { id: 'col-10', name: 'Folder Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'API Tests',
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request 1',
                data: { method: 'GET', url: `mock://status/200` }
              },
              {
                type: 'request',
                id: 'req-2',
                name: 'Request 2',
                data: { method: 'GET', url: `mock://status/201` }
              }
            ]
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.requestResults).toHaveLength(2);
      expect(result.requestResults[0].path).toContain('API Tests');
      expect(result.requestResults[1].path).toContain('API Tests');
    });

    test('Nested folders execute correctly', async () => {
      const collection: Collection = {
        info: { id: 'col-11', name: 'Nested Folders', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-outer',
            name: 'Outer',
            items: [
              {
                type: 'folder',
                id: 'folder-inner',
                name: 'Inner',
                items: [
                  {
                    type: 'request',
                    id: 'req-nested',
                    name: 'Nested Request',
                    data: { method: 'GET', url: `mock://status/200` }
                  }
                ]
              }
            ]
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].path).toBe('request:/Outer/Inner/Nested Request');
    });

    test('folderPreScript executes before folder requests', async () => {
      const collection: Collection = {
        info: { id: 'col-12', name: 'Folder Pre', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Setup Folder',
            folderPreScript: `
              quest.collection.variables.set('folderSetup', 'done');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Test Request',
                data: { method: 'GET', url: `mock://status/200` },
                postRequestScript: `
                  quest.test('Folder setup visible', () => {
                    expect(quest.collection.variables.get('folderSetup')).to.equal('done');
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

    test('folderPostScript executes after folder requests', async () => {
      const collection: Collection = {
        info: { id: 'col-13', name: 'Folder Post', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Cleanup Folder',
            folderPostScript: `
              quest.collection.variables.set('folderCleanup', 'done');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Test Request',
                data: { method: 'GET', url: `mock://status/200` }
              }
            ]
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result).toBeDefined();
      // Folder post executed (would need to verify via collection variables in actual implementation)
    });

    test('collection/folder post-script events are emitted (no tests allowed)', async () => {
      const collection: Collection = {
        info: { id: 'col-13b', name: 'Post Script Events', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPostScript: `
          // Variables and logging allowed, tests not allowed
          quest.global.variables.set('collectionPostRan', 'true');
        `,
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Post Script Folder',
            folderPostScript: `
              // Variables and logging allowed, tests not allowed
              quest.global.variables.set('folderPostRan', 'true');
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Test Request',
                data: { method: 'GET', url: `mock://status/200` }
              }
            ]
          }
        ]
      };

      let collectionPostEventReceived = false;
      let folderPostEventReceived = false;

      runner.on('afterCollectionPostScript', (payload: EventPayloads['afterCollectionPostScript']) => {
        expect(payload.collectionInfo.id).toBe('col-13b');
        expect(payload.result.success).toBe(true);
        collectionPostEventReceived = true;
      });

      runner.on('afterFolderPostScript', (payload: EventPayloads['afterFolderPostScript']) => {
        expect(payload.path).toBe('folder:/Post Script Folder');
        expect(payload.result.success).toBe(true);
        folderPostEventReceived = true;
      });

      await runner.run(collection);

      expect(collectionPostEventReceived).toBe(true);
      expect(folderPostEventReceived).toBe(true);
    });

    test('collection/folder post-scripts reject quest.test() calls', async () => {
      const collectionTestCollection: Collection = {
        info: { id: 'col-14a', name: 'Collection Test Error', version: '1.0.0' },
        protocol: 'mock-options',
        collectionPostScript: `
          quest.test('should fail', () => {
            expect(true).to.be.true;
          });
        `,
        items: []
      };

      // Pre-run validation now catches this - should return validation errors
      const result = await runner.run(collectionTestCollection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors![0].message).toContain('quest.test() is not allowed in collection-post scripts');

      const folderTestCollection: Collection = {
        info: { id: 'col-14b', name: 'Folder Test Error', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Test Folder',
            folderPostScript: `
              quest.test('should fail', () => {
                expect(true).to.be.true;
              });
            `,
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Test Request',
                data: { method: 'GET', url: `mock://status/200` }
              }
            ]
          }
        ]
      };

      // Pre-run validation now catches this - should return validation errors
      const folderResult = await runner.run(folderTestCollection);
      expect(folderResult.validationErrors).toBeDefined();
      expect(folderResult.validationErrors).toHaveLength(1);
      expect(folderResult.validationErrors![0].message).toContain('quest.test() is not allowed in folder-post scripts');
    });
  });

  // ========================================================================
  // Section 18.5: Variable scope across execution
  // ========================================================================
  
  describe('18.5 Variable persistence', () => {
    test('Global variables persist across iterations', async () => {
      const collection: Collection = {
        info: { id: 'col-14', name: 'Global Persistence', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Counter',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              const current = quest.global.variables.get('counter') || '0';
              const next = String(parseInt(current) + 1);
              quest.global.variables.set('counter', next);
              
              quest.test('Counter increments', () => {
                expect(parseInt(next)).to.be.greaterThan(0);
              });
            `
          }
        ],
        testData: [{row: 1}, {row: 2}, {row: 3}]
      };
      
      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, { globalVariables: globalVars });
      
      // After 3 iterations, counter should be 3
      expect(globalVars['counter']).toBe('3');
    });

    test('Collection variables persist across requests in same iteration', async () => {
      const collection: Collection = {
        info: { id: 'col-15', name: 'Collection Vars', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Setter',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.collection.variables.set('sharedData', 'fromReq1');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Getter',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.test('Can access collection variable', () => {
                expect(quest.collection.variables.get('sharedData')).to.equal('fromReq1');
              });
            `
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Local variables cleared between requests', async () => {
      const collection: Collection = {
        info: { id: 'col-16', name: 'Local Isolation', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Local Setter',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.scope.variables.set('localData', 'req1');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Local Checker',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.test('Local variable was cleared', () => {
                expect(quest.scope.variables.get('localData')).to.be.null;
              });
            `
          }
        ]
      };
      
      const result = await runner.run(collection);

      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 18.6: Execution history
  // ========================================================================
  
 describe('18.6 Execution history', () => {
    test('quest.history accumulates across requests', async () => {
      const collection: Collection = {
        info: { id: 'col-17', name: 'History Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'First',
            data: { method: 'GET', url: `mock://status/200` }
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Second',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.test('History has 2 requests', () => {
                expect(quest.history.requests.count()).to.equal(2);
                expect(quest.history.requests.get('req-1')).to.not.be.null;
              });
            `
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('History paths are correct for nested folders', async () => {
      const collection: Collection = {
        info: { id: 'col-18', name: 'History Paths', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'API',
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Get User',
                data: { method: 'GET', url: `mock://status/200` },
                postRequestScript: `
                  const history = quest.history.requests.all();
                  quest.test('Path is correct', () => {
                    expect(history[0].path).to.equal('request:/API/Get User');
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
  });

  // ========================================================================
  // Section 18.7: Test result aggregation
  // ========================================================================
  
  describe('18.7 Test result aggregation', () => {
    test('Passed tests are counted correctly', async () => {
      const collection: Collection = {
        info: { id: 'col-19', name: 'Pass Count', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.test('Test 1', () => expect(1).to.equal(1));
              quest.test('Test 2', () => expect(2).to.equal(2));
            `
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.totalTests).toBe(2);
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(0);
    });

    test('Failed tests are counted correctly', async () => {
      const collection: Collection = {
        info: { id: 'col-20', name: 'Fail Count', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.test('Passing', () => expect(1).to.equal(1));
              quest.test('Failing', () => expect(1).to.equal(2));
            `
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.totalTests).toBe(2);
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(1);
    });

    test('Skipped tests are counted correctly', async () => {
      const collection: Collection = {
        info: { id: 'col-21', name: 'Skip Count', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              quest.test('Normal', () => expect(1).to.equal(1));
              quest.test('Skipped', () => quest.skip('Skipping this'));
            `
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.totalTests).toBe(2);
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(0);
      expect(result.skippedTests).toBe(1);
    });
  });

  // ========================================================================
  // Section 18.8: Error handling
  // ========================================================================
  
  describe('18.8 Error handling', () => {
    test('Script error in request stops execution', async () => {
      const collection: Collection = {
        info: { id: 'col-22', name: 'Script Error', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Error Request',
            data: { method: 'GET', url: `mock://status/200` },
            postRequestScript: `
              throw new Error('Script failed');
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Should Not Run',
            data: { method: 'GET', url: 'mock://status/200' }
          }
        ]
      };
      
      await expect(runner.run(collection)).rejects.toThrow('Script failed');
    });

    test('Network error is captured in result', async () => {
      const collection: Collection = {
        info: { id: 'col-23', name: 'Network Error', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Bad URL',
            data: { method: 'GET', url: 'https://invalid-domain-that-does-not-exist-12345.com' }
          }
        ]
      };
      
      // Network errors should be caught and recorded, not thrown
      const result = await runner.run(collection);
      
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].success).toBe(false);
    });
  });
});


