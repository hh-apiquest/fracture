/**
 * Test Plan Section 30: Event System
 * Tests for proper event emission with EventEnvelope structure
 * 
 * This file validates all 21 core events emit correctly with proper parameters:
 * - beforeRun, afterRun (2)
 * - beforeCollectionPreScript, afterCollectionPreScript, beforeCollectionPostScript, afterCollectionPostScript (4)
 * - beforeIteration, afterIteration (2)
 * - beforeFolder, afterFolder, beforeFolderPreScript, afterFolderPreScript, beforeFolderPostScript, afterFolderPostScript (6)
 * - beforeItem, afterItem (2)
 * - beforePreScript, afterPreScript (2)
 * - beforeRequest, afterRequest (2)
 * - beforePostScript, afterPostScript (2)
 * - assertion (1)
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection, EventPayloads, RunnerEvent } from '@apiquest/types';
import { mockProtocolPlugin } from './test-helpers.js';

describe('Section 30: Event System', () => {
  let runner: CollectionRunner;
  let eventLog: Array<{ event: RunnerEvent; payload: EventPayloads[RunnerEvent] }>;

  const getEventPayload = <K extends RunnerEvent>(eventName: K): EventPayloads[K] | undefined => {
    const entry = eventLog.find(eventItem => eventItem.event === eventName);
    return entry?.payload as EventPayloads[K] | undefined;
  };

  const getEventPayloads = <K extends RunnerEvent>(eventName: K): EventPayloads[K][] => {
    return eventLog
      .filter(eventItem => eventItem.event === eventName)
      .map(eventItem => eventItem.payload as EventPayloads[K]);
  };

  const requireEventPayload = <K extends RunnerEvent>(eventName: K): EventPayloads[K] => {
    const payload = getEventPayload(eventName);
    if (payload === undefined) {
      throw new Error(`Missing event: ${eventName}`);
    }
    return payload;
  };

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockProtocolPlugin);
    eventLog = [];

    // Capture ALL events
    const events: RunnerEvent[] = [
      'beforeRun',
      'afterRun',
      'beforeCollectionPreScript',
      'afterCollectionPreScript',
      'beforeCollectionPostScript',
      'afterCollectionPostScript',
      'beforeIteration',
      'afterIteration',
      'beforeFolder',
      'afterFolder',
      'beforeFolderPreScript',
      'afterFolderPreScript',
      'beforeFolderPostScript',
      'afterFolderPostScript',
      'beforeItem',
      'afterItem',
      'beforePreScript',
      'afterPreScript',
      'beforeRequest',
      'afterRequest',
      'beforePostScript',
      'afterPostScript',
      'assertion',
      'console',
      'exception'
    ];

    events.forEach(eventName => {
      (runner as unknown as { on: (event: string, handler: (payload: EventPayloads[typeof eventName]) => void) => void })
        .on(eventName, (payload: EventPayloads[typeof eventName]) => {
          eventLog.push({ event: eventName, payload } as {
            event: RunnerEvent;
            payload: EventPayloads[RunnerEvent];
          });
        });
    });
  });

  // ========================================================================
  // Section 30.1: Run Lifecycle Events (beforeRun, afterRun)
  // ========================================================================

  describe('30.1 Run Lifecycle', () => {
    test('beforeRun includes collectionInfo, options, validationResult, expectedTestCount', async () => {
      const collection: Collection = {
        info: { id: 'col-run-1', name: 'Run Test', version: '1.0.0', description: 'Test desc' },
        protocol: 'http',
        items: []
      };

      await runner.run(collection);

      const beforeRun = requireEventPayload('beforeRun');
      
      // Verify collectionInfo
      expect(beforeRun.collectionInfo).toEqual({
        id: 'col-run-1',
        name: 'Run Test',
        version: '1.0.0',
        description: 'Test desc'
      });
      
      // Verify other required fields
      expect(beforeRun.options).toBeDefined();
      expect(beforeRun.validationResult).toBeDefined();
      expect(typeof beforeRun.expectedTestCount).toBe('number');
    });

    test('afterRun includes collectionInfo and result', async () => {
      const collection: Collection = {
        info: { id: 'col-run-2', name: 'After Run Test' },
        protocol: 'http',
        items: []
      };

      await runner.run(collection);

      const afterRun = requireEventPayload('afterRun');
      
      // Verify collectionInfo
      expect(afterRun.collectionInfo).toEqual({
        id: 'col-run-2',
        name: 'After Run Test'
      });
      
      // Verify result
      expect(afterRun.result).toBeDefined();
      expect(afterRun.result.collectionId).toBe('col-run-2');
      expect(afterRun.result.collectionName).toBe('After Run Test');
    });
  });

  // ========================================================================
  // Section 30.2: Collection Script Events
  // ========================================================================

  describe('30.2 Collection Scripts', () => {
    test('beforeCollectionPreScript and afterCollectionPreScript emit with EventEnvelope', async () => {
      const collection: Collection = {
        info: { id: 'col-script-1', name: 'Collection Pre Test' },
        protocol: 'http',
        collectionPreScript: `quest.variables.set('test', 'value');`,
        items: []
      };

      await runner.run(collection);

      const before = requireEventPayload('beforeCollectionPreScript');
      const after = requireEventPayload('afterCollectionPreScript');

      // Verify beforeCollectionPreScript
      expect(before.path).toBe('collection:/');
      expect(before.pathType).toBe('collection');
      expect(before.collectionInfo).toBeDefined();

      // Verify afterCollectionPreScript
      expect(after.path).toBe('collection:/');
      expect(after.result).toBeDefined();
      expect(after.result.success).toBe(true);
    });

    test('beforeCollectionPostScript and afterCollectionPostScript emit with EventEnvelope', async () => {
      const collection: Collection = {
        info: { id: 'col-script-2', name: 'Collection Post Test' },
        protocol: 'http',
        collectionPostScript: `quest.variables.set('done', 'true');`,
        items: []
      };

      await runner.run(collection);

      const before = requireEventPayload('beforeCollectionPostScript');
      const after = requireEventPayload('afterCollectionPostScript');

      // Verify beforeCollectionPostScript
      expect(before.path).toBe('collection:/');
      expect(before.pathType).toBe('collection');

      // Verify afterCollectionPostScript
      expect(after.path).toBe('collection:/');
      expect(after.result).toBeDefined();
      expect(after.result.success).toBe(true);
    });
  });

  // ========================================================================
  // Section 30.3: Iteration Events
  // ========================================================================

  describe('30.3 Iteration Lifecycle', () => {
    test('beforeIteration and afterIteration emit with iteration info', async () => {
      const collection: Collection = {
        info: { id: 'col-iter-1', name: 'Iteration Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-iter',
          name: 'Iter Request',
          data: {
            method: 'GET',
            url: 'https://api.example.com/data'
          }
        }],
        testData: [
          { id: '1', value: 'a' },
          { id: '2', value: 'b' }
        ]
      };

      await runner.run(collection);

      const beforeIterations = getEventPayloads('beforeIteration');
      const afterIterations = getEventPayloads('afterIteration');

      expect(beforeIterations.length).toBe(2);
      expect(afterIterations.length).toBe(2);

      // Verify first beforeIteration
      expect(beforeIterations[0]).toBeDefined();
      const firstBeforeIteration = beforeIterations[0];
      expect(firstBeforeIteration.iteration).toEqual({
        current: 1,
        total: 2,
        source: 'collection',
        rowIndex: 0,
        rowKeys: ['id', 'value'],
        row: { id: '1', value: 'a' }
      });
      expect(firstBeforeIteration.collectionInfo).toBeDefined();
      expect(firstBeforeIteration.path).toBe('collection:/');

      // Verify first afterIteration
      expect(afterIterations[0]).toBeDefined();
      const firstAfterIteration = afterIterations[0];
      const afterIterationDetails = firstAfterIteration.iteration;
      if (afterIterationDetails === undefined) {
        throw new Error('afterIteration.iteration is missing');
      }
      expect(afterIterationDetails.current).toBe(1);
      expect(firstAfterIteration.duration).toBeDefined();
      expect(typeof firstAfterIteration.duration).toBe('number');
    });
  });

  // ========================================================================
  // Section 30.4: Folder Events
  // ========================================================================

  describe('30.4 Folder Lifecycle', () => {
    test('beforeFolder and afterFolder emit with EventEnvelope', async () => {
      const collection: Collection = {
        info: { id: 'col-folder-1', name: 'Folder Test' },
        protocol: 'http',
        items: [{
          id: 'folder-1',
          type: 'folder',
          name: 'Test Folder',
          items: [{
            type: 'request',
            id: 'req-folder',
            name: 'Folder Request',
            data: {
              method: 'GET',
              url: 'https://api.example.com/data'
            }
          }]
        }]
      };

      await runner.run(collection);

      const before = requireEventPayload('beforeFolder');
      const after = requireEventPayload('afterFolder');

      // Verify beforeFolder
      expect(before.path).toBe('folder:/Test Folder');
      expect(before.pathType).toBe('folder');
      expect(before.collectionInfo).toBeDefined();

      // Verify afterFolder
      expect(after.path).toBe('folder:/Test Folder');
      expect(after.duration).toBeDefined();
      expect(typeof after.duration).toBe('number');
    });

    test('beforeFolderPreScript and afterFolderPreScript emit with EventEnvelope', async () => {
      const collection: Collection = {
        info: { id: 'col-folder-2', name: 'Folder Pre Test' },
        protocol: 'http',
        items: [{
          id: 'folder-2',
          type: 'folder',
          name: 'Scripted Folder',
          folderPreScript: `quest.variables.set('folderVar', 'test');`,
          items: [{
            type: 'request',
            id: 'req-fp',
            name: 'Request',
            data: {
              method: 'GET',
              url: 'https://api.example.com/data'
            }
          }]
        }]
      };

      await runner.run(collection);

      const before = requireEventPayload('beforeFolderPreScript');
      const after = requireEventPayload('afterFolderPreScript');

      // Verify beforeFolderPreScript
      expect(before.path).toBe('folder:/Scripted Folder');
      expect(before.pathType).toBe('folder');
      expect(before.collectionInfo).toBeDefined();

      // Verify afterFolderPreScript
      expect(after.result).toBeDefined();
      expect(after.result.success).toBe(true);
    });

    test('beforeFolderPostScript and afterFolderPostScript emit with EventEnvelope', async () => {
      const collection: Collection = {
        info: { id: 'col-folder-3', name: 'Folder Post Test' },
        protocol: 'http',
        items: [{
          id: 'folder-3',
          type: 'folder',
          name: 'Post Folder',
          folderPostScript: `quest.variables.set('done', 'true');`,
          items: [{
            type: 'request',
            id: 'req-fpost',
            name: 'Request',
            data: {
              method: 'GET',
              url: 'https://api.example.com/data'
            }
          }]
        }]
      };

      await runner.run(collection);

      const before = requireEventPayload('beforeFolderPostScript');
      const after = requireEventPayload('afterFolderPostScript');

      // Verify beforeFolderPostScript
      expect(before.path).toBe('folder:/Post Folder');
      expect(before.collectionInfo).toBeDefined();

      // Verify afterFolderPostScript
      expect(after.result).toBeDefined();
      expect(after.result.success).toBe(true);
    });
  });

  // ========================================================================
  // Section 30.5: Item Events
  // ========================================================================

  describe('30.5 Item Lifecycle', () => {
    test('beforeItem and afterItem wrap request execution with proper params', async () => {
      const collection: Collection = {
        info: { id: 'col-item-1', name: 'Item Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-item-1',
          name: 'Test Item',
          data: {
            method: 'POST',
            url: 'https://api.example.com/items'
          }
        }]
      };

      await runner.run(collection);

      const before = requireEventPayload('beforeItem');
      const after = requireEventPayload('afterItem');

      // Verify beforeItem
      expect(before.path).toBe('request:/Test Item');
      expect(before.pathType).toBe('request');
      expect(before.request).toBeDefined();
      expect(before.request.id).toBe('req-item-1');
      expect(before.collectionInfo).toBeDefined();

      // Verify afterItem
      expect(after.request).toBeDefined();
      expect(after.response).toBeDefined();
      expect(after.result).toBeDefined();
      expect(after.result.success).toBe(true);
    });
  });

  // ========================================================================
  // Section 30.6: Pre-Request Script Events
  // ========================================================================

  describe('30.6 Pre-Request Script', () => {
    test('beforePreScript and afterPreScript emit with EventEnvelope and request', async () => {
      const collection: Collection = {
        info: { id: 'col-pre-1', name: 'PreScript Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-pre-1',
          name: 'With PreScript',
          data: {
            method: 'GET',
            url: 'https://api.example.com/data'
          },
          preRequestScript: `quest.variables.set('preVar', 'value');`
        }]
      };

      await runner.run(collection);

      const before = requireEventPayload('beforePreScript');
      const after = requireEventPayload('afterPreScript');

      // Verify beforePreScript
      expect(before.path).toBe('request:/With PreScript');
      expect(before.pathType).toBe('request');
      expect(before.request).toBeDefined();
      expect(before.collectionInfo).toBeDefined();

      // Verify afterPreScript
      expect(after.request).toBeDefined();
      expect(after.result).toBeDefined();
      expect(after.result.success).toBe(true);
      expect(after.result.tests).toEqual([]);
    });
  });

  // ========================================================================
  // Section 30.7: Request Events
  // ========================================================================

  describe('30.7 Request Execution', () => {
    test('beforeRequest includes EventEnvelope and request', async () => {
      const collection: Collection = {
        info: { id: 'col-req-1', name: 'Request Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-test-1',
          name: 'Get User',
          data: {
            method: 'GET',
            url: 'https://api.example.com/users/1'
          }
        }]
      };

      await runner.run(collection);

      const beforeRequest = requireEventPayload('beforeRequest');
      
      // Verify EventEnvelope
      expect(beforeRequest.path).toBe('request:/Get User');
      expect(beforeRequest.pathType).toBe('request');
      expect(beforeRequest.collectionInfo).toEqual({
        id: 'col-req-1',
        name: 'Request Test'
      });
      
      // Verify request
      expect(beforeRequest.request).toBeDefined();
      expect(beforeRequest.request.id).toBe('req-test-1');
      expect(beforeRequest.request.name).toBe('Get User');
    });

    test('afterRequest includes EventEnvelope, request, response, and duration', async () => {
      const collection: Collection = {
        info: { id: 'col-req-2', name: 'Response Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-test-2',
          name: 'Post Data',
          data: {
            method: 'POST',
            url: 'https://api.example.com/data'
          }
        }]
      };

      await runner.run(collection);

      const afterRequest = requireEventPayload('afterRequest');
      
      // Verify EventEnvelope
      expect(afterRequest.collectionInfo).toBeDefined();
      expect(afterRequest.pathType).toBe('request');
      
      // Verify request, response, duration
      expect(afterRequest.request).toBeDefined();
      expect(afterRequest.response).toBeDefined();
      expect((afterRequest.response?.data as { status?: number } | undefined)?.status).toBe(200);
      expect(afterRequest.duration).toBeDefined();
      expect(typeof afterRequest.duration).toBe('number');
    });
  });

  // ========================================================================
  // Section 30.8: Post-Request Script Events
  // ========================================================================

  describe('30.8 Post-Request Script', () => {
    test('beforePostScript and afterPostScript emit with EventEnvelope, request, and response', async () => {
      const collection: Collection = {
        info: { id: 'col-post-1', name: 'PostScript Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-post-1',
          name: 'With PostScript',
          data: {
            method: 'GET',
            url: 'https://api.example.com/data'
          },
          postRequestScript: `// Post script code`
        }]
      };

      await runner.run(collection);

      const before = requireEventPayload('beforePostScript');
      const after = requireEventPayload('afterPostScript');

      // Verify beforePostScript
      expect(before.path).toBe('request:/With PostScript');
      expect(before.request).toBeDefined();
      expect(before.response).toBeDefined();
      expect(before.collectionInfo).toBeDefined();

      // Verify afterPostScript
      expect(after.request).toBeDefined();
      expect(after.response).toBeDefined();
      expect(after.result).toBeDefined();
      expect(after.result.success).toBe(true);
    });
  });

  // ========================================================================
  // Section 30.9: Assertion Events
  // ========================================================================

  describe('30.9 Assertion Events', () => {
    test('assertion event emits in real-time for each test with proper params', async () => {
      const collection: Collection = {
        info: { id: 'col-assert-1', name: 'Assertion Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-assert-1',
          name: 'Test Assertions',
          data: {
            method: 'GET',
            url: 'https://api.example.com/data'
          },
          postRequestScript: `
            quest.test('Test 1', () => {
              expect(1 + 1).to.equal(2);
            });
            
            quest.test('Test 2', () => {
              expect(true).to.be.true;
            });
            
            quest.test('Failing test', () => {
              expect(false).to.be.true;
            });
          `
        }]
      };

      await runner.run(collection);

      const assertions = getEventPayloads('assertion');
      expect(assertions.length).toBe(3);

      // Verify first assertion
      expect(assertions[0].test).toBeDefined();
      expect(assertions[0].test.name).toBe('Test 1');
      expect(assertions[0].test.passed).toBe(true);
      expect(assertions[0].request).toBeDefined();
      expect(assertions[0].response).toBeDefined();

      // Verify second assertion
      expect(assertions[1].test.name).toBe('Test 2');
      expect(assertions[1].test.passed).toBe(true);

      // Verify third assertion (failure)
      expect(assertions[2].test.name).toBe('Failing test');
      expect(assertions[2].test.passed).toBe(false);
      expect(assertions[2].test.error).toBeDefined();
    });
  });

  // ========================================================================
  // Section 30.10: Event Ordering
  // ========================================================================

  describe('30.10 Event Order Verification', () => {
    test('events emit in correct sequence for request with all scripts', async () => {
      const collection: Collection = {
        info: { id: 'col-order-1', name: 'Order Test' },
        protocol: 'http',
        collectionPreScript: `// Coll pre`,
        collectionPostScript: `// Coll post`,
        items: [{
          type: 'request',
          id: 'req-order-1',
          name: 'Full Scripts',
          data: {
            method: 'GET',
            url: 'https://api.example.com/data'
          },
          preRequestScript: `// Pre`,
          postRequestScript: `
            quest.test('Order test', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      await runner.run(collection);

      const eventNames = eventLog.map(e => e.event);
      
      // Find indices
      const beforeRunIdx = eventNames.indexOf('beforeRun');
      const beforeCollPreIdx = eventNames.indexOf('beforeCollectionPreScript');
      const afterCollPreIdx = eventNames.indexOf('afterCollectionPreScript');
      const beforeItemIdx = eventNames.indexOf('beforeItem');
      const beforePreScriptIdx = eventNames.indexOf('beforePreScript');
      const afterPreScriptIdx = eventNames.indexOf('afterPreScript');
      const beforeRequestIdx = eventNames.indexOf('beforeRequest');
      const afterRequestIdx = eventNames.indexOf('afterRequest');
      const beforePostScriptIdx = eventNames.indexOf('beforePostScript');
      const assertionIdx = eventNames.indexOf('assertion');
      const afterPostScriptIdx = eventNames.indexOf('afterPostScript');
      const afterItemIdx = eventNames.indexOf('afterItem');
      const beforeCollPostIdx = eventNames.indexOf('beforeCollectionPostScript');
      const afterCollPostIdx = eventNames.indexOf('afterCollectionPostScript');
      const afterRunIdx = eventNames.indexOf('afterRun');

      // Verify proper order
      expect(beforeRunIdx).toBeLessThan(beforeCollPreIdx);
      expect(beforeCollPreIdx).toBeLessThan(afterCollPreIdx);
      expect(afterCollPreIdx).toBeLessThan(beforeItemIdx);
      expect(beforeItemIdx).toBeLessThan(beforePreScriptIdx);
      expect(beforePreScriptIdx).toBeLessThan(afterPreScriptIdx);
      expect(afterPreScriptIdx).toBeLessThan(beforeRequestIdx);
      expect(beforeRequestIdx).toBeLessThan(afterRequestIdx);
      expect(afterRequestIdx).toBeLessThan(beforePostScriptIdx);
      expect(beforePostScriptIdx).toBeLessThan(assertionIdx);
      expect(assertionIdx).toBeLessThan(afterPostScriptIdx);
      expect(afterPostScriptIdx).toBeLessThan(afterItemIdx);
      expect(afterItemIdx).toBeLessThan(beforeCollPostIdx);
      expect(beforeCollPostIdx).toBeLessThan(afterCollPostIdx);
      expect(afterCollPostIdx).toBeLessThan(afterRunIdx);
    });

    test('folder events emit in correct order with nested structure', async () => {
      const collection: Collection = {
        info: { id: 'col-order-2', name: 'Folder Order Test' },
        protocol: 'http',
        items: [{
          id: 'folder-4',
          type: 'folder',
          name: 'Test Folder',
          folderPreScript: `// Folder pre`,
          folderPostScript: `// Folder post`,
          items: [{
            type: 'request',
            id: 'req-order-2',
            name: 'Nested Request',
            data: {
              method: 'GET',
              url: 'https://api.example.com/data'
            }
          }]
        }]
      };

      await runner.run(collection);

      const eventNames = eventLog.map(e => e.event);
      
      const beforeFolderIdx = eventNames.indexOf('beforeFolder');
      const beforeFolderPreIdx = eventNames.indexOf('beforeFolderPreScript');
      const afterFolderPreIdx = eventNames.indexOf('afterFolderPreScript');
      const beforeItemIdx = eventNames.indexOf('beforeItem');
      const beforeRequestIdx = eventNames.indexOf('beforeRequest');
      const afterRequestIdx = eventNames.indexOf('afterRequest');
      const afterItemIdx = eventNames.indexOf('afterItem');
      const beforeFolderPostIdx = eventNames.indexOf('beforeFolderPostScript');
      const afterFolderPostIdx = eventNames.indexOf('afterFolderPostScript');
      const afterFolderIdx = eventNames.indexOf('afterFolder');

      // Verify folder wraps everything
      expect(beforeFolderIdx).toBeLessThan(beforeFolderPreIdx);
      expect(beforeFolderPreIdx).toBeLessThan(afterFolderPreIdx);
      expect(afterFolderPreIdx).toBeLessThan(beforeItemIdx);
      expect(beforeItemIdx).toBeLessThan(beforeRequestIdx);
      expect(beforeRequestIdx).toBeLessThan(afterRequestIdx);
      expect(afterRequestIdx).toBeLessThan(afterItemIdx);
      expect(afterItemIdx).toBeLessThan(beforeFolderPostIdx);
      expect(beforeFolderPostIdx).toBeLessThan(afterFolderPostIdx);
      expect(afterFolderPostIdx).toBeLessThan(afterFolderIdx);
    });

    test('iteration events wrap all folder and item events', async () => {
      const collection: Collection = {
        info: { id: 'col-order-3', name: 'Iteration Order Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-order-3',
          name: 'Iterated Request',
          data: {
            method: 'GET',
            url: 'https://api.example.com/data'
          }
        }],
        testData: [{ id: '1' }, { id: '2' }]
      };

      await runner.run(collection);

      const eventNames = eventLog.map(e => e.event);
      
      // First iteration
      const firstBeforeIterIdx = eventNames.indexOf('beforeIteration');
      const firstBeforeItemIdx = eventNames.indexOf('beforeItem');
      const firstAfterItemIdx = eventNames.indexOf('afterItem');
      const firstAfterIterIdx = eventNames.indexOf('afterIteration');

      // Second iteration
      const secondBeforeIterIdx = eventNames.indexOf('beforeIteration', firstAfterIterIdx + 1);
      const secondBeforeItemIdx = eventNames.indexOf('beforeItem', firstAfterItemIdx + 1);

      // Verify first iteration wraps item
      expect(firstBeforeIterIdx).toBeLessThan(firstBeforeItemIdx);
      expect(firstBeforeItemIdx).toBeLessThan(firstAfterItemIdx);
      expect(firstAfterItemIdx).toBeLessThan(firstAfterIterIdx);

      // Verify second iteration comes after first
      expect(firstAfterIterIdx).toBeLessThan(secondBeforeIterIdx);
      expect(secondBeforeIterIdx).toBeLessThan(secondBeforeItemIdx);
    });
  });

  // ========================================================================
  // Section 30.11: EventEnvelope Field Validation
  // ========================================================================

  describe('30.11 EventEnvelope Field Validation', () => {
    test('All events (except beforeRun/afterRun) include full EventEnvelope', async () => {
      const collection: Collection = {
        info: { id: 'col-env-1', name: 'Envelope Test' },
        protocol: 'http',
        collectionPreScript: `// Pre`,
        items: [{
          id: 'folder-env-1',
          type: 'folder',
          name: 'Test Folder',
          folderPreScript: `// Folder pre`,
          items: [{
            type: 'request',
            id: 'req-env-1',
            name: 'Request',
            data: {
              method: 'GET',
              url: 'https://api.example.com/data'
            },
            preRequestScript: `// Pre`,
            postRequestScript: `quest.test('t', () => expect(true).to.be.true);`
          }]
        }]
      };

      await runner.run(collection);

      const eventsWithFullEnvelope: RunnerEvent[] = [
        'beforeCollectionPreScript',
        'afterCollectionPreScript',
        'beforeFolder',
        'afterFolder',
        'beforeFolderPreScript',
        'afterFolderPreScript',
        'beforeItem',
        'afterItem',
        'beforePreScript',
        'afterPreScript',
        'beforeRequest',
        'afterRequest',
        'beforePostScript',
        'afterPostScript'
      ];

      type FullEnvelopePayload = EventPayloads['beforeCollectionPreScript'];

      eventsWithFullEnvelope.forEach(eventName => {
        const event = requireEventPayload(eventName) as FullEnvelopePayload;
        expect(event, `Event ${eventName} should exist`).toBeDefined();
        expect(event.path, `${eventName} should have path`).toBeDefined();
        expect(event.pathType, `${eventName} should have pathType`).toBeDefined();
        expect(event.collectionInfo, `${eventName} should have collectionInfo`).toBeDefined();
      });
    });

    test('Iteration events include required iteration field', async () => {
      const collection: Collection = {
        info: { id: 'col-env-2', name: 'Iteration Envelope Test' },
        protocol: 'http',
        items: [{
          type: 'request',
          id: 'req-env-2',
          name: 'Request',
          data: {
            method: 'GET',
            url: 'https://api.example.com/data'
          }
        }],
        testData: [{ x: '1' }]
      };

      await runner.run(collection);

      const beforeIter = requireEventPayload('beforeIteration');
      const afterIter = requireEventPayload('afterIteration');
      const beforeIterDetails = beforeIter.iteration;
      const afterIterDetails = afterIter.iteration;
      if (beforeIterDetails === undefined || afterIterDetails === undefined) {
        throw new Error('Iteration details missing');
      }

      // Verify both have iteration field
      expect(beforeIterDetails).toBeDefined();
      expect(beforeIterDetails.current).toBe(1);
      expect(beforeIterDetails.total).toBe(1);
      expect(beforeIterDetails.source).toBe('collection');
      expect(beforeIterDetails.rowIndex).toBe(0);
      expect(beforeIterDetails.row).toEqual({ x: '1' });

      expect(afterIterDetails).toBeDefined();
      expect(afterIterDetails.current).toBe(1);
    });
  });
});
