/**
 * Compile-time assertions that scriptDeclarations.ts ambient types
 * match the actual QuestScriptAPI runtime interface from QuestScriptTypes.ts.
 *
 * This file produces NO runtime output. It only runs during `tsc`.
 * If QuestAPI.ts runtime changes break the declared interface, this file
 * will fail to compile — forcing an update to scriptDeclarations.ts.
 *
 * How it works:
 * - `QuestScriptAPI` is the strongly typed interface returned by createQuestAPI()
 * - The `_satisfies` variable forces TypeScript to check structural compatibility
 * - A conditional type `_Check` evaluates to `true` if compatible, `never` if not
 * - `never` causes a compile error with a descriptive message
 */

import type { QuestScriptAPI, QuestVariablesStoreAPI, QuestVariablesAPI, QuestIterationDataAPI, QuestHistoryRequestsAPI, QuestRequestTimeoutAPI, QuestCookiesAPI } from './QuestScriptTypes.js';
import { createQuestAPI } from './QuestAPI.js';

// Verify that createQuestAPI return type is assignable to QuestScriptAPI
type _RuntimeReturnType = ReturnType<typeof createQuestAPI>;

// If this type is `true`, the shapes are compatible.
// If it resolves to `never`, tsc will error on the line below.
type _Check = _RuntimeReturnType extends QuestScriptAPI ? true : never;
const _check: _Check = true as const;

// Suppress unused variable warning
void _check;

// Verify key sub-shapes are intact after variable resolution fix
type _CheckVariablesStore = QuestVariablesStoreAPI extends {
  get(key: string): string | number | boolean | null;
  set(key: string, value: string | number | boolean | null): void;
  has(key: string): boolean;
  remove(key: string): boolean;
  clear(): void;
  toObject(): Record<string, string | number | boolean | null>;
} ? true : never;
const _checkStore: _CheckVariablesStore = true as const;
void _checkStore;

type _CheckVariables = QuestVariablesAPI extends {
  get(key: string): string | number | boolean | null;
  set(key: string, value: string | number | boolean | null): void;
  has(key: string): boolean;
  replaceIn(template: string): string;
} ? true : never;
const _checkVars: _CheckVariables = true as const;
void _checkVars;
