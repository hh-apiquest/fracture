import type { TestResult } from '@apiquest/types';

export interface PluginEventTest extends TestResult {
  eventName?: string;
}

export interface ErrorWithPhase extends Error {
  phase?: string;
}
