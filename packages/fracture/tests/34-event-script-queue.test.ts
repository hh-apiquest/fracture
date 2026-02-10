/**
 * Test Plan Section 34: Plugin Event Scripts Queue
 * Tests that plugin event scripts execute through the script queue
 * to prevent variable race conditions
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockStreamingPlugin } from './test-helpers.js';

describe('Section 34: Plugin Event Scripts Queue', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockStreamingPlugin);
  });

  // ========================================================================
  // 34.1: Event scripts execute through queue
  // ========================================================================
  
  describe('34.1 Event scripts execute serially', () => {
    test('Plugin event scripts mutate variables safely', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-event-queue', name: 'Event Script Queue' },
        protocol: 'mock-stream',
        items: [
          {
            type: 'request',
            id: 'stream-req',
            name: 'Stream Request',
            data: {
              url: 'mock://stream',
              scripts: [
                {
                  event: 'onMessage',
                  script: `
                    const count = parseInt(quest.global.variables.get('messageCount') || '0');
                    quest.global.variables.set('messageCount', (count + 1).toString());
                  `
                }
              ]
            }
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars
      });

      expect(result.requestResults.length).toBe(1);
      expect(result.requestResults[0].success).toBe(true);
      
      // mockStreamingPlugin emits 3 onMessage events
      // Counter should be exactly 3 (no race conditions)
      const messageCount = globalVars['messageCount'];
      expect(messageCount).toBe('3');
    });
  });

  // ========================================================================
  // 34.2: Multiple event scripts maintain order
  // ========================================================================
  
  describe('34.2 Multiple event scripts maintain order', () => {
    test('Event scripts execute in order', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-event-order', name: 'Event Script Order' },
        protocol: 'mock-stream',
        items: [
          {
            type: 'request',
            id: 'stream-req',
            name: 'Stream Request',
            data: {
              url: 'mock://stream',
              scripts: [
                {
                  event: 'onMessage',
                  script: `
                    const order = quest.global.variables.get('order') || '';
                    quest.global.variables.set('order', order + 'M,');
                  `
                },
                {
                  event: 'onComplete',
                  script: `
                    const order = quest.global.variables.get('order') || '';
                    quest.global.variables.set('order', order + 'C');
                  `
                }
              ]
            }
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars
      });

      expect(result.requestResults.length).toBe(1);
      
      // Order: 3 messages, then complete
      const order = globalVars['order'];
      expect(order).toBe('M,M,M,C');
    });
  });

  // ========================================================================
  // 34.3: Event scripts in parallel mode
  // ========================================================================
  
  describe('34.3 Event scripts serialized even in parallel mode', () => {
    test('Multiple streaming requests with event scripts', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-parallel-events', name: 'Parallel Event Scripts' },
        protocol: 'mock-stream',
        items: Array.from({ length: 3 }, (_, i) => ({
          type: 'request' as const,
          id: `stream-${i}`,
          name: `Stream ${i}`,
          data: {
            url: 'mock://stream',
            scripts: [
              {
                event: 'onMessage',
                script: `
                  const count = parseInt(quest.global.variables.get('eventCount') || '0');
                  quest.global.variables.set('eventCount', (count + 1).toString());
                `
              }
            ]
          }
        }))
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: true, maxConcurrency: 3 }
      });

      expect(result.requestResults.length).toBe(3);
      
      // Each request emits 3 messages: 3 requests * 3 messages = 9 total
      // Counter should be exactly 9 (no race conditions)
      const eventCount = globalVars['eventCount'];
      expect(eventCount).toBe('9');
    });
  });

  // ========================================================================
  // 34.4: Event scripts can access quest.response
  // ========================================================================
  
  describe('34.4 Event scripts have access to context', () => {
    test('Event script can access request context', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-event-context', name: 'Event Script Context' },
        protocol: 'mock-stream',
        items: [
          {
            type: 'request',
            id: 'stream-req',
            name: 'Named Stream',
            data: {
              url: 'mock://stream',
              scripts: [
                {
                  event: 'onComplete',
                  script: `
                    // Access request name
                    quest.global.variables.set('requestName', quest.request.info.name);
                    // Access response
                    quest.global.variables.set('hasResponse', quest.response ? 'true' : 'false');
                  `
                }
              ]
            }
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars
      });

      expect(result.requestResults.length).toBe(1);
      
      // Event scripts can access quest.request and quest.response
      expect(globalVars['requestName']).toBe('Named Stream');
      expect(globalVars['hasResponse']).toBe('true');
    });
  });

  // ========================================================================
  // 34.5: Event scripts can run tests
  // ========================================================================
  
  describe('34.5 Event scripts can run tests', () => {
    test('Event scripts execute quest.test()', async () => {
      const collection: Collection = {
        info: { id: 'test-event-tests', name: 'Event Script Tests' },
        protocol: 'mock-stream',
        items: [
          {
            type: 'request',
            id: 'stream-req',
            name: 'Stream Request',
            data: {
              url: 'mock://stream',
              scripts: [
                {
                  event: 'onMessage',
                  script: `
                    quest.test('Message received', () => {
                      expect(true).to.be.true;
                    });
                  `
                },
                {
                  event: 'onComplete',
                  script: `
                    quest.test('Stream completed', () => {
                      expect(quest.response.status).to.equal(200);
                    });
                  `
                }
              ]
            }
          }
        ]
      };

      const result = await runner.run(collection);

      expect(result.requestResults.length).toBe(1);
      
      // 3 onMessage events + 1 onComplete = 4 tests
      const requestResult = result.requestResults[0];
      expect(requestResult.tests.length).toBe(4);
      expect(requestResult.tests.filter(t => t.passed).length).toBe(4);
    });
  });
});
