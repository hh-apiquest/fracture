// Section 25: Plugin Event Runtime Enhancements
// Tests quest.event.index and quest.expectMessages() for streaming protocols

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import { mockOptionsPlugin } from './test-helpers.js';
import { mockStreamingPlugin, createTestServer, type MockHttpServer } from './test-helpers.js';
import type { Collection, EventPayloads } from '@apiquest/types';

describe('Section 25: Plugin Event Runtime Enhancements', () => {
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

  describe('25.1 quest.event', () => {
    test('quest.event is null for non-plugin-event scripts', async () => {
      const collection: Collection = {
        info: { id: 'col-1', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          preRequestScript: `
            if (quest.event !== null) {
              throw new Error('event should be null in preRequestScript');
            }
          `,
          postRequestScript: `
            quest.test('event.index is null', () => {
              expect(quest.event).to.be.null;
            });
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.passedTests).toBe(1);
    });

    test('event.index increments for each plugin event of same type', async () => {
      runner = new CollectionRunner();
      runner.registerPlugin(mockStreamingPlugin);
      
      const collection: Collection = {
        info: { id: 'col-eventidx', name: 'Event Index Test', version: '1.0.0' },
        protocol: 'mock-stream',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onMessage',
              script: `
                quest.test('Message at index ' + quest.event.index, () => {
                  expect(quest.event.index).toBeGreaterThanOrEqual(0);
                  expect(quest.event.index).toBeLessThan(3);
                });
              `
            }]
          },
          preRequestScript: `quest.expectMessages(3);`
        }]
      };

      const result = await runner.run(collection);
      
      // Debug: check what we got
      // console.log('Request results:', result.requestResults.length);
      // console.log('Tests:', result.requestResults[0]?.tests?.length);
      // console.log('Tests details:', result.requestResults[0]?.tests);
      
      // Should have 3 tests (one per message)
      expect(result.passedTests).toBe(3);
      
      // event.index should have incremented: 0, 1, 2
      // Verify by checking test names
      const testNames = result.requestResults[0].tests.map(t => t.name);
      expect(testNames).toContain('Message at index 0');
      expect(testNames).toContain('Message at index 1');
      expect(testNames).toContain('Message at index 2');
    });

    test('event.index resets per request', async () => {
      runner = new CollectionRunner();
      runner.registerPlugin(mockStreamingPlugin);
      
      const collection: Collection = {
        info: { id: 'col-reset', name: 'event.index Reset Test', version: '1.0.0' },
        protocol: 'mock-stream',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request 1',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onMessage',
              script: `quest.test('Req1 Msg ' + quest.event.index, () => {});`
            }]
          },
          preRequestScript: `quest.expectMessages(2);`
        },
        {
          type: 'request',
          id: 'req-2',
          name: 'Request 2',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onMessage',
              script: `quest.test('Req2 Msg ' + quest.event.index, () => {});`
            }]
          },
          preRequestScript: `quest.expectMessages(2);`
        }]
      };

      const result = await runner.run(collection);
      
      // Both requests should have event.index starting at 0
      const req1Tests = result.requestResults[0].tests.map(t => t.name);
      const req2Tests = result.requestResults[1].tests.map(t => t.name);
      
      expect(req1Tests).toContain('Req1 Msg 0');
      expect(req1Tests).toContain('Req1 Msg 1');
      expect(req2Tests).toContain('Req2 Msg 0');  // Resets to 0 for second request
      expect(req2Tests).toContain('Req2 Msg 1');
    });

    test('event.index is separate per event type', async () => {
      runner = new CollectionRunner();
      runner.registerPlugin(mockStreamingPlugin);
      
      const collection: Collection = {
        info: { id: 'col-separate', name: 'Separate Index Test', version: '1.0.0' },
        protocol: 'mock-stream',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [
              {
                event: 'onMessage',
                script: `quest.test('onMessage ' + quest.event.index, () => {});`
              },
              {
                event: 'onComplete',
                script: `quest.test('onComplete ' + quest.event.index, () => {});`
              }
            ]
          },
          preRequestScript: `quest.expectMessages(3);`
        }]
      };

      const result = await runner.run(collection);
      const testNames = result.requestResults[0].tests.map(t => t.name);
      
      // onMessage should have indices 0, 1, 2
      expect(testNames).toContain('onMessage 0');
      expect(testNames).toContain('onMessage 1');
      expect(testNames).toContain('onMessage 2');
      
      // onComplete should have index 0 (separate counter from onMessage)
      expect(testNames).toContain('onComplete 0');
    });
  });

  describe('25.2 quest.expectMessages() - Pre-Run Validation', () => {
    test('Validates quest.expectMessages() is only in preRequestScript', async () => {
      const collection: Collection = {
        info: { id: 'col-2', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `
            quest.expectMessages(5);  // Wrong location
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors![0].message).toContain('quest.expectMessages() can only be called in preRequestScript');
    });
  });

  describe('25.3 quest.expectMessages() - Runtime Validation', () => {
    test('Rejects HTTP protocol (no plugin events)', async () => {
      const collection: Collection = {
        info: { id: 'col-3', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          preRequestScript: `
            quest.expectMessages(5);  // HTTP has no plugin events with canHaveTests
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
      expect(result.validationErrors![0].message).toContain('not supported for protocol');
    });

    test('Requires positive integer count', async () => {
      const collection: Collection = {
        info: { id: 'col-4', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          preRequestScript: `
            quest.expectMessages(0);  // Invalid: must be > 0
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.some(err => err.message.includes('positive integer'))).toBe(true);
    });

    test('Rejects negative count', async () => {
      const collection: Collection = {
        info: { id: 'col-5', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          preRequestScript: `
            quest.expectMessages(-5);
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
      expect(result.validationErrors!.some(err => err.message.includes('positive integer'))).toBe(true);
    });

    test('Rejects non-integer count', async () => {
      const collection: Collection = {
        info: { id: 'col-6', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          preRequestScript: `
            quest.expectMessages(5.5);  // Not an integer
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.some(err => err.message.includes('positive integer'))).toBe(true);
    });
  });

  describe('25.4 quest.expectMessages() Integration with Test Counting', () => {
    beforeEach(() => {
      runner = new CollectionRunner();
      runner.registerPlugin(mockStreamingPlugin);
    });

    test('Test count uses expected message count for plugin events', async () => {
      let expectedTestCount: number | undefined;
      runner.on('beforeRun', (payload: EventPayloads['beforeRun']) => {
        expectedTestCount = payload.expectedTestCount;
      });

      const collection: Collection = {
        info: { id: 'col-count-1', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-stream',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onMessage',
              script: `quest.test('message test', () => {});`
            }]
          },
          preRequestScript: `quest.expectMessages(5);`
        }]
      };

      await runner.run(collection);
      // 1 test × 5 messages = 5 total tests
      expect(expectedTestCount).toBe(5);
    });

    test('Returns -1 (dynamic) without quest.expectMessages() hint', async () => {
      let expectedTestCount: number | undefined;
      runner.on('beforeRun', (payload: EventPayloads['beforeRun']) => {
        expectedTestCount = payload.expectedTestCount;
      });

      const collection: Collection = {
        info: { id: 'col-dynamic', name: 'Dynamic Count Test', version: '1.0.0' },
        protocol: 'mock-stream',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onMessage',
              script: `quest.test('dynamic test', () => {});`
            }]
          }
          // NO quest.expectMessages() - can't determine count
        }]
      };

      await runner.run(collection);
      // Should be -1 (dynamic)
      expect(expectedTestCount).toBe(-1);
    });

    test('Multiplies by iteration count', async () => {
      let expectedTestCount: number | undefined;
      runner.on('beforeRun', (payload: EventPayloads['beforeRun']) => {
        expectedTestCount = payload.expectedTestCount;
      });

      const collection: Collection = {
        info: { id: 'col-iteration', name: 'Iteration Test', version: '1.0.0' },
        protocol: 'mock-stream',
        testData: [{ iteration: 1 }, { iteration: 2 }],  // 2 iterations
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onMessage',
              script: `quest.test('iteration test', () => {});`  // 1 test
            }]
          },
          preRequestScript: `quest.expectMessages(3);`  // 3 messages
        }]
      };

      await runner.run(collection);
      // 1 test × 3 messages × 2 iterations = 6 total tests
      expect(expectedTestCount).toBe(6);
    });
  });

  describe('25.5 Plugin Event Script Validation', () => {
    beforeEach(() => {
      runner = new CollectionRunner();
      runner.registerPlugin(mockStreamingPlugin);
    });

    test('Allows tests in plugin events with canHaveTests=true', async () => {
      // onMessage has canHaveTests=true, should allow tests
      const collection: Collection = {
        info: { id: 'col-val-1', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-stream',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onMessage',
              script: `quest.test('message test', () => {});`
            }]
          }
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors ?? []).toHaveLength(0);
    });

    test('Rejects tests in plugin events with canHaveTests=false', async () => {
      // onError has canHaveTests=false, should reject tests
      const collection: Collection = {
        info: { id: 'col-val-2', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-stream',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: {
            method: 'STREAM',
            url: 'mock://stream',
            scripts: [{
              event: 'onError',
              script: `quest.test('error test', () => {});` // Should be rejected
            }]
          }
        }]
      };

      const result = await runner.run(collection);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
      expect(result.validationErrors!.some(err => 
        err.message.includes('onError') && err.message.includes('canHaveTests')
      )).toBe(true);
    });
  });

  describe('25.6 Documentation and API Surface', () => {
    test('quest.event.index property exists and is accessible', async () => {
      const collection: Collection = {
        info: { id: 'col-7', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          postRequestScript: `
            quest.test('event property exists', () => {
              expect(quest).to.have.property('event');
            });
          `
        }]
      };

      const result = await runner.run(collection);
      expect(result.passedTests).toBe(1);
    });

    test('quest.expectMessages function exists and is callable', async () => {
      const collection: Collection = {
        info: { id: 'col-8', name: 'Test Collection', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: '${serverUrl}/status/200' },
          preRequestScript: `
            // Verify function exists
            if (typeof quest.expectMessages !== 'function') {
              throw new Error('quest.expectMessages should be a function');
            }
            // Don't call it - that would trigger validation error
          `
        }]
      };

      const result = await runner.run(collection);
      // Should execute successfully (no validation errors, no script errors)
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].scriptError).toBeUndefined();
    });
  });

});

