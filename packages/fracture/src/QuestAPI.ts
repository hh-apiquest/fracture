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
      } else if (config.body.mode === 'urlencoded' && config.body.urlencoded !== null && config.body.urlencoded !== undefined) {
        // Convert to URLSearchParams
        const params = new URLSearchParams();
        for (const item of config.body.urlencoded) {
          params.append(item.key, item.value);
        }
        fetchOptions.body = params.toString();
        (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (config.body.mode === 'formdata' && config.body.formdata !== null && config.body.formdata !== undefined) {
        // FormData
        const formData = new FormData();
        for (const item of config.body.formdata) {
          formData.append(item.key, item.value);
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

  return {
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
          // Priority: iteration > scope stack > collection > env => global
          const currentIterationData = context.iterationData?.[context.iterationCurrent - 1];
          if (currentIterationData !== null && currentIterationData !== undefined && key in currentIterationData) {
            return String(currentIterationData[key]);
          }

          // Search scope stack (top to bottom)
          for (let i = context.scopeStack.length - 1; i >= 0; i--) {
            if (key in context.scopeStack[i].vars) {
              return context.scopeStack[i].vars[key];
            }
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
          // Search scope stack for existing key, or set in top scope
          for (let i = context.scopeStack.length - 1; i >= 0; i--) {
            if (key in context.scopeStack[i].vars) {
              context.scopeStack[i].vars[key] = value;
              return;
            }
          }

          // Not found: set in current (top) scope
          if (context.scopeStack.length > 0) {
            context.scopeStack[context.scopeStack.length - 1].vars[key] = value;
          }
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
          // Search scope stack top to bottom
          for (let i = context.scopeStack.length - 1; i >= 0; i--) {
            if (key in context.scopeStack[i].vars) {
              return context.scopeStack[i].vars[key];
            }
          }
          return null;
        },
        set(key: string, value: string) {
          // Search stack for existing key, or set in top scope
          for (let i = context.scopeStack.length - 1; i >= 0; i--) {
            if (key in context.scopeStack[i].vars) {
              context.scopeStack[i].vars[key] = value;
              return;
            }
          }

          // Not found: set in current (top) scope
          if (context.scopeStack.length > 0) {
            context.scopeStack[context.scopeStack.length - 1].vars[key] = value;
          }
        },
        has(key: string) {
          return this.get(key) !== null;
        },
        remove(key: string) {
          // Remove from the scope where it exists
          for (let i = context.scopeStack.length - 1; i >= 0; i--) {
            if (key in context.scopeStack[i].vars) {
              delete context.scopeStack[i].vars[key];
              return true;
            }
          }
          return false;
        },
        clear() {
          // Clear current (top) scope only
          if (context.scopeStack.length > 0) {
            context.scopeStack[context.scopeStack.length - 1].vars = {};
          }
        },
        toObject() {
          // Merge all scopes (bottom to top, so top overrides)
          const result: Record<string, string> = {};
          for (let i = 0; i < context.scopeStack.length; i++) {
            Object.assign(result, context.scopeStack[i].vars);
          }
          return result;
        }
      }
    },

    // Response API
    response: context.currentResponse !== null && context.currentResponse !== undefined ? {
      status: context.currentResponse.status,
      statusText: context.currentResponse.statusText,
      headers: {
        // Method API
        get(name: string) {
          if (context.currentResponse?.headers === null || context.currentResponse?.headers === undefined) return null;
          // Case-insensitive lookup
          const lowerName = name.toLowerCase();
          for (const [key, value] of Object.entries(context.currentResponse.headers)) {
            if (key.toLowerCase() === lowerName) {
              return value;
            }
          }
          return null;
        },
        has(name: string) {
          if (context.currentResponse?.headers === null || context.currentResponse?.headers === undefined) return false;
          // Case-insensitive lookup
          const lowerName = name.toLowerCase();
          for (const key of Object.keys(context.currentResponse.headers)) {
            if (key.toLowerCase() === lowerName) {
              return true;
            }
          }
          return false;
        },
        toObject() {
          return context.currentResponse?.headers ?? {};
        }
      },
      body: context.currentResponse.body,
      text() {
        return context.currentResponse?.body ?? '';
      },
      json() {
        try {
          return JSON.parse(context.currentResponse?.body ?? '{}') as unknown;
        } catch {
          return {};
        }
      },
      time: context.currentResponse.duration,
      size: context.currentResponse.body?.length ?? 0,
      // Assertion helpers
      to: {
        be: {
          ok: context.currentResponse.status === 200,
          success: context.currentResponse.status >= 200 && context.currentResponse.status < 300,
          clientError: context.currentResponse.status >= 400 && context.currentResponse.status < 500,
          serverError: context.currentResponse.status >= 500 && context.currentResponse.status < 600
        },
        have: {
          status(code: number) {
            return context.currentResponse?.status === code;
          },
          header(name: string) {
            if (context.currentResponse?.headers === null || context.currentResponse?.headers === undefined) return false;
            const lowerName = name.toLowerCase();
            for (const key of Object.keys(context.currentResponse.headers)) {
              if (key.toLowerCase() === lowerName) {
                return true;
              }
            }
            return false;
          },
          jsonBody(field: string) {
            try {
              const data = JSON.parse(context.currentResponse?.body ?? '{}') as Record<string, unknown>;
              return field in data;
            } catch {
              return false;
            }
          }
        }
      }
    } : null,

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
      url: (context.currentRequest?.data.url ?? '') as string,
      method: (context.currentRequest?.data.method ?? '') as string,
      body: {
        get() {
          if (context.currentRequest?.data.body === null || context.currentRequest?.data.body === undefined) return null;
          const body = context.currentRequest.data.body as string | Record<string, unknown>;

          // Handle different body modes
          if (typeof body === 'string') return body;
          if (typeof body === 'object' && 'mode' in body && (body as { mode?: string }).mode === 'raw') return (body as { raw?: string }).raw ?? null;
          if (typeof body === 'object' && 'mode' in body && (body as { mode?: string }).mode === 'urlencoded') return null; // Return null for non-raw modes
          if (typeof body === 'object' && 'mode' in body && (body as { mode?: string }).mode === 'formdata') return null;

          return null;
        },
        set(content: string) {
          if (context.currentRequest === null || context.currentRequest === undefined) return;
          if (context.currentRequest.data.body === null || context.currentRequest.data.body === undefined) {
            context.currentRequest.data.body = { mode: 'raw', raw: content };
          } else if (typeof context.currentRequest.data.body === 'string') {
            context.currentRequest.data.body = content;
          } else if (typeof context.currentRequest.data.body === 'object') {
            (context.currentRequest.data.body as { raw?: string }).raw = content;
          }
        },
        get mode() {
          if (context.currentRequest?.data.body === null || context.currentRequest?.data.body === undefined) return null;
          const body = context.currentRequest.data.body as string | Record<string, unknown>;

          if (typeof body === 'string') return 'raw';
          return (typeof body === 'object' && 'mode' in body ? (body as { mode?: string }).mode : 'raw') as string;
        }
      },
      headers: {
        add(header: { key: string; value: string; }) {
          if (context.currentRequest === null || context.currentRequest === undefined) return;
          const headers = context.currentRequest.data.headers as Record<string, string> | undefined;
          if (headers === null || headers === undefined) {
            context.currentRequest.data.headers = {};
          }
          (context.currentRequest.data.headers as Record<string, string>)[header.key] = header.value;
        },
        remove(key: string) {
          if (context.currentRequest?.data.headers === null || context.currentRequest?.data.headers === undefined) return;
          delete (context.currentRequest.data.headers as Record<string, string>)[key];
        },
        get(key: string) {
          if (context.currentRequest?.data.headers === null || context.currentRequest?.data.headers === undefined) return null;
          // Case-insensitive lookup
          const lowerKey = key.toLowerCase();
          for (const [headerKey, value] of Object.entries(context.currentRequest.data.headers as Record<string, string>)) {
            if (headerKey.toLowerCase() === lowerKey) {
              return value;
            }
          }
          return null;
        },
        upsert(header: { key: string; value: string; }) {
          if (context.currentRequest === null || context.currentRequest === undefined) return;
          const headers = context.currentRequest.data.headers as Record<string, string> | undefined;
          if (headers === null || headers === undefined) {
            context.currentRequest.data.headers = {};
          }
          (context.currentRequest.data.headers as Record<string, string>)[header.key] = header.value;
        },
        toObject() {
          return (context.currentRequest?.data.headers ?? {}) as Record<string, string>;
        }
      },
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
}
