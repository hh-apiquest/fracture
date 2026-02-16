import type { ExecutionContext, TestResult, Cookie, CookieSetOptions } from '@apiquest/types';
import { ScriptType } from '@apiquest/types';
import { createQuestTestAPI } from './QuestTestAPI.js';
import type { CookieJar } from './CookieJar.js';
import type { RequestConfig, ResponseObject, HistoryFilterCriteria } from './QuestAPI.types.js';
import { isNullOrWhitespace } from './utils.js';

/**
 * Helper: Execute HTTP request and return response object
 * Used by quest.sendRequest() to make requests from scripts
 */
async function executeHttpRequest(config: RequestConfig, signal: AbortSignal): Promise<ResponseObject> {
  // Use native fetch
  const url = config.url;
  const method = config.method ?? 'GET';
  const headers = config.header ?? config.headers ?? {};

  if (isNullOrWhitespace(url)) {
    throw new Error('sendRequest requires a "url" property');
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal
  };

  // Handle body
  if (config.body !== null && config.body !== undefined) {
    if (typeof config.body === 'object' && 'mode' in config.body && config.body.mode !== null && config.body.mode !== undefined) {
      // Handle different body modes
      if (config.body.mode === 'raw') {
        fetchOptions.body = config.body.raw;
      } else if (config.body.mode === 'urlencoded' && config.body.kv !== null && config.body.kv !== undefined) {
        // Convert to URLSearchParams
        const params = new URLSearchParams();
        for (const item of config.body.kv) {
          params.append(item.key, item.value);
        }
        fetchOptions.body = params.toString();
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (config.body.mode === 'formdata' && config.body.kv !== null && config.body.kv !== undefined) {
        // FormData
        const formData = new FormData();
        for (const item of config.body.kv) {
          if (item.type === 'binary') {
            const buffer = Buffer.from(item.value, 'base64');
            formData.append(item.key, buffer, item.key);
          } else {
            formData.append(item.key, item.value);
          }
        }
        fetchOptions.body = formData;
      }
    } else if (typeof config.body === 'string') {
      fetchOptions.body = config.body;
    } else {
      // Assume JSON
      fetchOptions.body = JSON.stringify(config.body);
      const headersRecord = fetchOptions.headers as Record<string, string>;
      headersRecord['Content-Type'] ??= 'application/json';
    }
  }

  try {
    const startTime = Date.now();
    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - startTime;
    const body = await response.text();

    // Convert headers, preserving multiple values (e.g., set-cookie)
    const headers: Record<string, string | string[]> = {};
    const headerCounts: Record<string, number> = {};

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (headerCounts[lowerKey] === 0 || headerCounts[lowerKey] === undefined) {
        headerCounts[lowerKey] = 0;
        headers[lowerKey] = value;
      } else {
        // Multiple values for this header - convert to array
        const existing = headers[lowerKey];
        if (!Array.isArray(existing)) {
          headers[lowerKey] = [existing];
        }
        (headers[lowerKey] as string[]).push(value);
      }
      headerCounts[lowerKey]++;
    });

    // Return response object compatible with quest API
    const responseObj: ResponseObject = {
      status: response.status,
      statusText: response.statusText,
      body: body,
      headers: headers,
      time: duration,
      // Helper methods
      json() {
        try {
          return JSON.parse(body) as unknown;
        } catch {
          return null;
        }
      },
      text() {
        return body;
      }
    };

    return responseObj;
  } catch (error: unknown) {
    const errorName = (error as { name?: string }).name;
    const errorMsg = (error as { message?: string }).message ?? 'Unknown error';
    
    // Handle abort error
    if (errorName === 'AbortError') {
      throw new Error('Request aborted');
    }
    
    throw new Error(`Request failed: ${errorMsg}`);
  }
}

/**
 * Creates the complete quest API object
 * Returns all quest.* methods and properties for script execution
 */
export function createQuestAPI(
  context: ExecutionContext,
  scriptType: ScriptType,
  tests: TestResult[], // Array to collect test results
  emitAssertion: (test: TestResult) => void
): Record<string, unknown> {
  // Create test API (test, skip, fail) with abort signal
  const testAPI = createQuestTestAPI(tests, scriptType, emitAssertion, context.abortSignal);

  const questApi: Record<string, unknown> = {
    // Test API
    test: testAPI.test,
    skip: testAPI.skip,
    fail: testAPI.fail,

    // Send HTTP request - supports BOTH async/await and callback patterns
    sendRequest(config: RequestConfig, callback?: (err: Error | null, res: ResponseObject | null) => void) {
      const requestPromise = executeHttpRequest(config, context.abortSignal);

      // If callback provided, use callback pattern
      if (callback !== null && callback !== undefined && typeof callback === 'function') {
        requestPromise
          .then((res) => {
            callback(null, res);
          })
          .catch((err) => {
            callback(err as Error, null);
          });
        return undefined; // Don't return promise in callback mode
      } else {
        // No callback, return Promise for async/await
        return requestPromise;
      }
    },

    // Wait/delay execution
    wait(ms: number) {
      if (typeof ms !== 'number' || isNaN(ms)) {
        throw new Error('quest.wait() requires a valid number of milliseconds');
      }
      if (ms < 0) {
        throw new Error('quest.wait() milliseconds must be non-negative');
      }
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Variables API
    variables: (() => {
      const variablesAPI = {
        get(key: string) {
          // Priority: iteration > scope chain > collection > env => global
          const currentIterationData = context.iterationData?.[context.iterationCurrent - 1];
          if (currentIterationData !== null && currentIterationData !== undefined && key in currentIterationData) {
            return String(currentIterationData[key]);
          }

          // Search scope chain (current -> parent)
          let currentScope: typeof context.scope | undefined = context.scope;
          while (currentScope !== undefined) {
            if (key in currentScope.vars) {
              return currentScope.vars[key];
            }
            currentScope = currentScope.parent;
          }

          if (key in context.collectionVariables) {
            return context.collectionVariables[key];
          }
          if (context.environment !== null && context.environment !== undefined && key in context.environment.variables) {
            return context.environment.variables[key];
          }
          if (key in context.globalVariables) {
            return context.globalVariables[key];
          }
          return null;
        },

        set(key: string, value: string) {
          // Search scope chain for existing key, or set in current scope
          let currentScope: typeof context.scope | undefined = context.scope;
          while (currentScope !== undefined) {
            if (key in currentScope.vars) {
              currentScope.vars[key] = value;
              return;
            }
            currentScope = currentScope.parent;
          }

          // Not found: set in current scope
          context.scope.vars[key] = value;
        },

        replaceIn(template: string): string {
          if (isNullOrWhitespace(template)) return template;

          // Replace all {{variable}} patterns
          return template.replace(/\{\{([^}]+)\}\}/g, (match, varName: string) => {
            const value = variablesAPI.get(varName.trim());
            // If variable not found, leave the placeholder
            return value !== null ? String(value) : match;
          });
        },

        has(key: string) {
          return variablesAPI.get(key) !== null;
        }
      };
      return variablesAPI;
    })(),

    // Global variables
    global: {
      variables: {
        get(key: string) {
          return context.globalVariables[key] ?? null;
        },
        set(key: string, value: string) {
          context.globalVariables[key] = value;
        },
        has(key: string) {
          return key in context.globalVariables;
        },
        remove(key: string) {
          if (key in context.globalVariables) {
            delete context.globalVariables[key];
            return true;
          }
          return false;
        },
        clear() {
          context.globalVariables = {};
        },
        toObject() {
          return { ...context.globalVariables };
        }
      }
    },

    // Collection API
    collection: {
      // Collection info
      info:
      {
        ...context.collectionInfo,
        version:
          context.collectionInfo.version !== null &&
            context.collectionInfo.version !== undefined &&
            context.collectionInfo.version !== ''
            ? context.collectionInfo.version
            : null,
        description:
          context.collectionInfo.description !== null &&
            context.collectionInfo.description !== undefined &&
            context.collectionInfo.description !== ''
            ? context.collectionInfo.description
            : null,
      },

      // Collection variables
      variables: {
        get(key: string) {
          return context.collectionVariables[key] ?? null;
        },
        set(key: string, value: string) {
          context.collectionVariables[key] = value;
        },
        has(key: string) {
          return key in context.collectionVariables;
        },
        remove(key: string) {
          if (key in context.collectionVariables) {
            delete context.collectionVariables[key];
            return true;
          }
          return false;
        },
        clear() {
          context.collectionVariables = {};
        },
        toObject() {
          return { ...context.collectionVariables };
        }
      }
    },

    // Environment variables
    environment: {
      name: context.environment?.name ?? null,
      variables: {
        get(key: string) {
          return context.environment?.variables[key] ?? null;
        },
        set(key: string, value: string) {
          context.environment ??= { name: 'Runtime Environment', variables: {} };
          context.environment.variables[key] = value;
        },
        has(key: string) {
          return context.environment !== null && context.environment !== undefined ? key in context.environment.variables : false;
        },
        remove(key: string) {
          if (context.environment !== null && context.environment !== undefined && key in context.environment.variables) {
            delete context.environment.variables[key];
            return true;
          }
          return false;
        },
        clear() {
          if (context.environment !== null && context.environment !== undefined) {
            context.environment.variables = {};
          }
        },
        toObject() {
          return context.environment !== null && context.environment !== undefined ? { ...context.environment.variables } : {};
        }
      }
    },

    // Scope variables (hierarchical)
    scope: {
      variables: {
        get(key: string) {
          // Search scope chain (current -> parent)
          let currentScope: typeof context.scope | undefined = context.scope;
          while (currentScope !== undefined) {
            if (key in currentScope.vars) {
              return currentScope.vars[key];
            }
            currentScope = currentScope.parent;
          }
          return null;
        },
        set(key: string, value: string) {
          // Search scope chain for existing key, or set in current scope
          let currentScope: typeof context.scope | undefined = context.scope;
          while (currentScope !== undefined) {
            if (key in currentScope.vars) {
              currentScope.vars[key] = value;
              return;
            }
            currentScope = currentScope.parent;
          }

          // Not found: set in current scope
          context.scope.vars[key] = value;
        },
        has(key: string) {
          return this.get(key) !== null;
        },
        remove(key: string) {
          // Remove from the scope where it exists
          let currentScope: typeof context.scope | undefined = context.scope;
          while (currentScope !== undefined) {
            if (key in currentScope.vars) {
              delete currentScope.vars[key];
              return true;
            }
            currentScope = currentScope.parent;
          }
          return false;
        },
        clear() {
          // Clear current scope only
          context.scope.vars = {};
        },
        toObject() {
          // Merge all scopes (parent to child, so child overrides)
          const result: Record<string, string> = {};
          const chain: typeof context.scope[] = [];
          let currentScope: typeof context.scope | undefined = context.scope;
          while (currentScope !== undefined) {
            chain.unshift(currentScope);
            currentScope = currentScope.parent;
          }
          for (const scope of chain) {
            Object.assign(result, scope.vars);
          }
          return result;
        }
      }
    },

    // Response API (provided by protocol adapter)
    response: null,

    // Request info and modification API
    request: {
      info: {
        name: context.currentRequest?.name ?? '',
        id: context.currentRequest?.id ?? '',
        protocol: context.protocol,
        description: context.currentRequest?.description ?? ''
      },
      dependsOn: context.currentRequest?.dependsOn ?? null,
      condition: context.currentRequest?.condition ?? null,
      timeout: {
        set(ms: number) {
          // Only allowed in preRequestScript
          if (scriptType !== ScriptType.PreRequest) {
            throw new Error('quest.request.timeout.set() can only be called in preRequestScript');
          }

          if (context.currentRequest === null || context.currentRequest === undefined) {
            throw new Error('quest.request.timeout.set() requires an active request');
          }

          // Validate timeout is a positive number
          if (typeof ms !== 'number' || ms <= 0 || !Number.isFinite(ms)) {
            throw new Error('quest.request.timeout.set() requires a positive finite number in milliseconds');
          }

          // Initialize options object using nullish coalescing operator
          context.currentRequest.options ??= {};

          // Initialize timeout object using nullish coalescing operator
          context.currentRequest.options.timeout ??= {};

          // Set the per-request timeout override
          context.currentRequest.options.timeout.request = ms;
        },
        get() {
          // Can be called from any script
          if (context.currentRequest === null || context.currentRequest === undefined) {
            return null;
          }

          // Check for per-request timeout override first
          const requestTimeout = context.currentRequest.options?.timeout?.request;
          if (requestTimeout !== null && requestTimeout !== undefined) {
            return requestTimeout;
          }

          // Fall back to context/CLI timeout
          const contextTimeout = context.options?.timeout?.request;
          return contextTimeout ?? null;
        }
      }
    },

    // Iteration API
    iteration: {
      current: context.iterationCurrent,
      count: context.iterationCount,
      data: {
        get(key: string) {
          const currentData = context.iterationData?.[context.iterationCurrent - 1];
          return currentData?.[key] ?? null;
        },
        has(key: string) {
          const currentData = context.iterationData?.[context.iterationCurrent - 1];
          return currentData !== null && currentData !== undefined ? key in currentData : false;
        },
        toObject() {
          return context.iterationData?.[context.iterationCurrent - 1] ?? {};
        },
        keys() {
          const currentData = context.iterationData?.[context.iterationCurrent - 1];
          return currentData !== null && currentData !== undefined ? Object.keys(currentData) : [];
        },
        all() {
          return context.iterationData ?? [];
        }
      }
    },

    // Execution history API
    history: {
      requests: {
        count() {
          return context.executionHistory.length;
        },
        get(idOrName: string) {
          return context.executionHistory.find(
            entry => entry.id === idOrName || entry.name === idOrName
          ) ?? null;
        },
        all() {
          return context.executionHistory;
        },
        last() {
          return context.executionHistory.length > 0
            ? context.executionHistory[context.executionHistory.length - 1]
            : null;
        },
        filter(criteria: HistoryFilterCriteria) {
          return context.executionHistory.filter(entry => {
            // Filter by path (with wildcard support)
            if (criteria.path !== null && criteria.path !== undefined) {
              const pathPattern = criteria.path.replace(/\*/g, '.*');
              const pathRegex = new RegExp(`^${pathPattern}$`);
              if (!pathRegex.test(entry.path)) {
                return false;
              }
            }

            // Filter by name
            if (criteria.name !== null && criteria.name !== undefined && entry.name !== criteria.name) {
              return false;
            }

            // Filter by iteration
            if (criteria.iteration !== null && criteria.iteration !== undefined && entry.iteration !== criteria.iteration) {
              return false;
            }

            // Filter by id
            if (criteria.id !== null && criteria.id !== undefined && entry.id !== criteria.id) {
              return false;
            }

            return true;
          });
        }
      }
    },

    // Cookies API - Uses cookie jar for persistence across requests
    cookies: {
      get(name: string) {
        // Use cookie jar if available
        if (context.cookieJar !== null && context.cookieJar !== undefined) {
          return context.cookieJar.get(name);
        }
        return null;
      },
      set(name: string, value: string, options: CookieSetOptions) {
        if (context.cookieJar !== null && context.cookieJar !== undefined) {
          context.cookieJar.set(name, value, options);
        }
      },
      has(name: string) {
        // Use cookie jar if available
        if (context.cookieJar !== null && context.cookieJar !== undefined) {
          return context.cookieJar.has(name);
        }
        return false;
      },
      remove(name: string) {
        // Use cookie jar if available
        if (context.cookieJar !== null && context.cookieJar !== undefined) {
          context.cookieJar.remove(name);
        }
      },
      clear() {
        // Use cookie jar if available
        if (context.cookieJar !== null && context.cookieJar !== undefined) {
          context.cookieJar.clear();
        }
      },
      toObject() {
        // Use cookie jar if available
        if (context.cookieJar !== null && context.cookieJar !== undefined) {
          return context.cookieJar.toObject();
        }
        return {};
      }
    },

    // Plugin event API (for PluginEvent script type)
    event: context.currentEvent !== null && context.currentEvent !== undefined ? {
      name: context.currentEvent.eventName,
      timestamp: context.currentEvent.timestamp,
      data: (() => {
        const rawData = context.currentEvent.data as string | Record<string, unknown>;
        // Add json() helper method
        const dataWithHelper: Record<string, unknown> = typeof rawData === 'string' ? { value: rawData } : rawData;
        dataWithHelper.json = function () {
          try {
            return (typeof rawData === 'string' ? JSON.parse(rawData) : rawData) as unknown;
          } catch {
            return null;
          }
        };
        return dataWithHelper;
      })(),
      index: context.currentEvent.index
    } : null,

    // Hint expected message count (for streaming protocols)
    expectMessages(count: number, timeout?: number) {
      // Only allowed in preRequestScript
      if (scriptType !== ScriptType.PreRequest) {
        throw new Error('quest.expectMessages() can only be called in preRequestScript');
      }

      // Validate count is positive integer
      if (!Number.isInteger(count) || count <= 0) {
        throw new Error('quest.expectMessages() requires a positive integer count');
      }

      // Validate protocol has plugin events with canHaveTests
      const protocolPlugin = context.protocolPlugin;
      const hasTestableEvents = protocolPlugin.events?.some((e: { canHaveTests?: boolean }) => e.canHaveTests === true) === true;

      if (hasTestableEvents === false) {
        throw new Error(
          `quest.expectMessages() is not supported for protocol '${context.protocol}' ` +
          `(no plugin events with canHaveTests)`
        );
      }

      // Store count in context for plugin optimization and test counting
      context.expectedMessages = count;

    }
  };

  const reservedKeys = new Set([
    'collection',
    'environment',
    'iteration',
    'global',
    'scope',
    'request',
    'response',
    'cookies',
    'test',
    'expect',
    'event',
    'sendRequest',
    'wait',
    'variables',
    'history',
    'expectMessages'
  ]);

  const provider = context.protocolPlugin.protocolAPIProvider;
  if (provider !== null && provider !== undefined) {
    const providerApi = provider(context);

    if (typeof providerApi === 'object' && providerApi !== null) {
      const providerRecord = providerApi;

      if (typeof providerRecord.request === 'object' && providerRecord.request !== null) {
        questApi.request = {
          ...(questApi.request as Record<string, unknown>),
          ...(providerRecord.request as Record<string, unknown>)
        };
      }

      if (typeof providerRecord.response !== 'undefined') {
        questApi.response = providerRecord.response;
      }

      for (const [key, value] of Object.entries(providerRecord)) {
        if (key === 'request' || key === 'response') continue;
        if (reservedKeys.has(key)) continue;
        questApi[key] = value;
      }
    }
  }

  return questApi;
}
