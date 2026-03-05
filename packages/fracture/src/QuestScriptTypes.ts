/**
 * Strongly typed interfaces for the quest script API.
 *
 * These are the exported runtime types used by:
 * 1. QuestAPI.ts — createQuestAPI return type (single runtime source of truth)
 * 2. scriptDeclarations.assert.ts — compile-time enforcement that runtime matches declarations
 *
 * If you change QuestAPI.ts runtime behavior, update these interfaces first.
 * The assert file will fail to compile if they diverge.
 */

import type { CookieSetOptions, SendRequest, SendRequestResponse, VariablePrimitive } from '@apiquest/types';

export interface QuestVariablesStoreAPI {
  get(key: string): VariablePrimitive;
  set(key: string, value: VariablePrimitive): void;
  has(key: string): boolean;
  remove(key: string): boolean;
  clear(): void;
  toObject(): Record<string, VariablePrimitive>;
}

export interface QuestVariablesAPI {
  get(key: string): VariablePrimitive;
  set(key: string, value: VariablePrimitive): void;
  has(key: string): boolean;
  replaceIn(template: string): string;
}

export interface QuestCollectionInfoAPI {
  id: string;
  name: string;
  version: string | null;
  description: string | null;
}

export interface QuestIterationDataAPI {
  get(key: string): string | number | boolean | null;
  has(key: string): boolean;
  toObject(): Record<string, string | number | boolean>;
  keys(): string[];
  all(): Array<Record<string, string | number | boolean>>;
}

export interface QuestHistoryRequestsAPI {
  count(): number;
  get(idOrName: string): { id: string; name: string; path: string; iteration: number } | null;
  all(): Array<{ id: string; name: string; path: string; iteration: number }>;
  last(): { id: string; name: string; path: string; iteration: number } | null;
  filter(criteria: { path?: string; name?: string; iteration?: number; id?: string }): Array<{ id: string; name: string; path: string; iteration: number }>;
}

export interface QuestRequestTimeoutAPI {
  set(ms: number): void;
  get(): number | null;
}

export interface QuestEventDataAPI {
  json(): unknown;
  [key: string]: unknown;
}

export interface QuestCookiesAPI {
  get(name: string): string | null;
  set(name: string, value: string, options: CookieSetOptions): void;
  has(name: string): boolean;
  remove(name: string): void;
  clear(): void;
  toObject(): Record<string, string>;
}

/**
 * The full typed shape of the quest object returned by createQuestAPI.
 * Protocol plugins spread their own request/response properties on top at runtime.
 * Index signature allows the provider merge in QuestAPI.ts to compile.
 */
export interface QuestScriptAPI {
  test(name: string, fn: () => void | Promise<void>): void;
  skip(reason: string): never;
  fail(message: string): never;
  sendRequest(request: SendRequest, callback?: (err: Error | null, res: SendRequestResponse | null) => void): Promise<SendRequestResponse> | undefined;
  wait(ms: number): Promise<void>;
  variables: QuestVariablesAPI;
  global: { variables: QuestVariablesStoreAPI };
  collection: { info: QuestCollectionInfoAPI; variables: QuestVariablesStoreAPI };
  environment: { name: string | null; variables: QuestVariablesStoreAPI };
  scope: { variables: QuestVariablesStoreAPI };
  request: {
    info: { name: string; id: string; protocol: string; description: string };
    timeout: QuestRequestTimeoutAPI;
    dependsOn: string[] | null;
    condition: string | null;
    [key: string]: unknown;
  };
  response: unknown;
  iteration: {
    current: number;
    count: number;
    data: QuestIterationDataAPI;
  };
  history: { requests: QuestHistoryRequestsAPI };
  cookies: QuestCookiesAPI;
  event: {
    name: string;
    timestamp: Date;
    data: QuestEventDataAPI;
    index: number;
  } | null;
  expectMessages(count: number): void;
  [key: string]: unknown;
}
