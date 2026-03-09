import { createRequire } from 'module';
import type {
  IReporter,
  Collection,
  RunOptions,
  RunResult,
  LogLevel,
  EventPayloads
} from '@apiquest/types';
import { LogLevel as LogLevelEnum } from '@apiquest/types';

const _require = createRequire(import.meta.url);
const pkg = _require('../../package.json') as { version: string };
const FRACTURE_VERSION: string = pkg.version;

/**
 * CLI reporter - prints run progress to a stream (stdout or stderr).
 * Reporter name: 'cli'
 * Default export target: stdout
 */
export class ConsoleReporter implements IReporter {
  readonly name = 'cli';
  readonly version: string = FRACTURE_VERSION;
  readonly description = 'Pretty CLI output for quest runs';
  readonly reportTypes: string[] = ['cli'];
  readonly outputType = 'stdout' as const;

  private logLevel: LogLevel;
  private color: boolean;
  private silent: boolean;
  private stream: NodeJS.WritableStream;

  constructor() {
    this.logLevel = LogLevelEnum.INFO;
    this.color = true;
    this.silent = false;
    this.stream = process.stdout;
  }

  // -------------------------------------------------------------------------
  // IReporter — configure & validate
  // -------------------------------------------------------------------------

  configure(options: Record<string, unknown>, exportTarget?: string): void {
    if (typeof options.color === 'boolean') {
      this.color = options.color;
    }
    if (typeof options.silent === 'boolean') {
      this.silent = options.silent;
    }
    if (typeof options.logLevel === 'number') {
      this.logLevel = options.logLevel as LogLevel;
    }

    // Resolve export target stream
    if (exportTarget === 'stderr') {
      this.stream = process.stderr;
    } else {
      // 'stdout' or undefined → stdout
      this.stream = process.stdout;
    }
  }

  validate(): { valid: boolean; error?: string } {
    // cli reporter is always valid — it defaults to stdout
    return { valid: true };
  }

  flush(): Promise<void> {
    // cli reporter writes in real-time; nothing to flush
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private write(line: string): void {
    if (this.silent) return;
    this.stream.write(line + '\n');
  }

  private colorize(text: string, colorCode: string): string {
    if (!this.color) return text;
    return `${colorCode}${text}\x1b[0m`;
  }

  // -------------------------------------------------------------------------
  // IReporter — lifecycle hooks
  // -------------------------------------------------------------------------

  onRunStarted(collection: Collection, _options: RunOptions): void {
    this.write('============================================================');
    this.write(`  Fracture v${FRACTURE_VERSION}`);
    this.write(`  Collection: ${collection.info.name}`);
    this.write('============================================================');
    this.write('');
  }

  onBeforeRequest(payload: EventPayloads['beforeRequest']): void {
    this.write('');
    this.write(`${this.colorize('>', '\x1b[36m')} ${payload.request.name}`);

    const requestData = payload.request.data as Record<string, unknown> | null | undefined;
    if (requestData !== null && requestData !== undefined) {
      const method = typeof requestData.method === 'string' && requestData.method.length > 0
        ? requestData.method
        : 'GET';
      const url = typeof requestData.url === 'string' && requestData.url.length > 0
        ? requestData.url
        : '';
      this.write(`  ${method} ${url}`);
    }
  }

  onAfterRequest(payload: EventPayloads['afterRequest']): void {
    const summary = payload.response.summary;
    if (summary.outcome === 'error') {
      const message = summary.message ?? 'Unknown error';
      this.write(`  ${this.colorize('[FAIL]', '\x1b[31m')} ERROR: ${message}`);
      return;
    }

    const code = summary.code ?? 'n/a';
    const label = summary.label ?? '';
    const duration = summary.duration ?? payload.duration;
    this.write(`  ${this.colorize('<', '\x1b[32m')} ${code} ${label} (${duration}ms)`);
  }

  onAssertion(payload: EventPayloads['assertion']): void {
    const test = payload.test;
    if (test.skipped) {
      this.write(`  ${this.colorize('[SKIP]', '\x1b[90m')} ${test.name}`);
    } else if (test.passed) {
      this.write(`  ${this.colorize('[PASS]', '\x1b[32m')} ${test.name}`);
    } else {
      this.write(`  ${this.colorize('[FAIL]', '\x1b[31m')} ${test.name}`);
      if (test.error !== null && test.error !== undefined && test.error.length > 0) {
        this.write(`    Error: ${test.error}`);
      }
    }
  }

  onConsole(payload: EventPayloads['console']): void {
    if (this.silent) return;
    if (payload.level <= this.logLevel) {
      const levelName = payload.levelName ?? 'log';
      const tag = `[${levelName.toUpperCase()}]`;
      if (payload.level === LogLevelEnum.ERROR) {
        process.stderr.write(`${tag} ${payload.message}\n`);
      } else if (payload.level === LogLevelEnum.WARN) {
        process.stderr.write(`${tag} ${payload.message}\n`);
      } else {
        this.write(`${tag} ${payload.message}`);
      }
    }
  }

  onRunCompleted(result: RunResult): void {
    this.write('');
    this.write('------------------------------------------------------------');
    this.write('');
    this.write('RESULTS:');
    this.write(`  Collection: ${result.collectionName}`);
    this.write(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    this.write(`  Requests: ${result.requestResults.length}`);

    const successful = result.requestResults.filter(r => r.success).length;
    const failed = result.requestResults.filter(r => !r.success).length;

    if (successful > 0) {
      this.write(`    - Successful: ${successful}`);
    }
    if (failed > 0) {
      this.write(`    - Failed: ${failed}`);
    }

    if (result.totalTests > 0) {
      this.write(`  Tests: ${result.totalTests}`);
      this.write(`    - Passed: ${result.passedTests}`);
      if (result.failedTests > 0) {
        this.write(`    - Failed: ${result.failedTests}`);
      }
      if (result.skippedTests > 0) {
        this.write(`    - Skipped: ${result.skippedTests}`);
      }
    }

    this.write('');

    if (result.failedTests > 0) {
      this.write(`${this.colorize('[FAIL]', '\x1b[31m')} Collection run completed with errors`);
    } else {
      this.write(`${this.colorize('[PASS]', '\x1b[32m')} Collection run completed successfully`);
    }
  }
}
