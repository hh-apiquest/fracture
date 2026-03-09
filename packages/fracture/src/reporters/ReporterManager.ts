import type { IReporter, Collection, RunOptions, RunResult, EventPayloads } from '@apiquest/types';
import type { EventEmitter } from 'events';
import { ConsoleReporter } from './ConsoleReporter.js';
import { JsonReporter } from './JsonReporter.js';
import { JunitReporter } from './JunitReporter.js';
import { HtmlReporter } from './HtmlReporter.js';

// ============================================================================
// Types
// ============================================================================

export interface ReporterExport {
  /** Reporter name, e.g. 'cli', 'json', 'junit', 'html' */
  name: string;
  /** 'stdout' | 'stderr' | file path */
  target: string;
}

export interface ReporterManagerOptions {
  /** Reporter names to activate. Defaults to ['cli']. */
  reporters?: string[];
  /** Per-reporter export targets from --reporter-export name=target */
  exports?: ReporterExport[];
  /** Per-reporter options from --reporter-opt name.key=value */
  reporterOptions?: Record<string, Record<string, unknown>>;
  /** Suppress all reporter output (--silent) */
  silent?: boolean;
  /** Disable color in cli reporter (--no-color) */
  noColor?: boolean;
  /** Log level to pass to cli reporter */
  logLevel?: number;
  /** Additional reporter instances from plugins */
  pluginReporters?: IReporter[];
}

/**
 * Built-in reporter registry.
 * Maps reporter name to factory function.
 */
const BUILT_IN_REPORTERS: Record<string, () => IReporter> = {
  cli: () => new ConsoleReporter(),
  json: () => new JsonReporter(),
  junit: () => new JunitReporter(),
  html: () => new HtmlReporter()
};

/**
 * Orchestrates multiple reporters.
 *
 * Responsibilities:
 * - Instantiates built-in reporters by name
 * - Configures each reporter with options and export target
 * - Validates all reporters before run starts
 * - Fans out runner events to all reporters
 * - Calls flush() on all reporters after run completes
 */
export class ReporterManager {
  private reporters: IReporter[] = [];

  /**
   * Build and configure reporters from CLI options.
   * Call this once before attaching to runner events.
   */
  static create(options: ReporterManagerOptions): ReporterManager {
    const mgr = new ReporterManager();

    const requestedNames = options.reporters !== undefined && options.reporters.length > 0
      ? options.reporters
      : ['cli'];

    const exportsMap = new Map<string, string>();
    for (const exp of options.exports ?? []) {
      exportsMap.set(exp.name, exp.target);
    }

    const reporterOpts = options.reporterOptions ?? {};

    // Build plugin reporter registry from options.pluginReporters
    const pluginRegistry = new Map<string, IReporter>();
    for (const pr of options.pluginReporters ?? []) {
      for (const reportType of pr.reportTypes) {
        pluginRegistry.set(reportType, pr);
      }
    }

    for (const name of requestedNames) {
      const factory = BUILT_IN_REPORTERS[name];
      let reporter: IReporter;

      if (factory !== undefined) {
        reporter = factory();
      } else if (pluginRegistry.has(name)) {
        reporter = pluginRegistry.get(name)!;
      } else {
        const available = [
          ...Object.keys(BUILT_IN_REPORTERS),
          ...Array.from(pluginRegistry.keys())
        ].join(', ');
        throw new Error(`Unknown reporter: '${name}'. Available reporters: ${available}`);
      }

      // Build per-reporter options
      const perOpts: Record<string, unknown> = { ...(reporterOpts[name] ?? {}) };

      // Apply convenience aliases for cli reporter
      if (name === 'cli') {
        if (options.silent === true) {
          perOpts.silent = true;
        }
        if (options.noColor === true) {
          perOpts.color = false;
        }
        if (options.logLevel !== undefined) {
          perOpts.logLevel = options.logLevel;
        }
      }

      // Configure reporter
      const exportTarget = exportsMap.get(name);
      reporter.configure?.(perOpts, exportTarget);

      mgr.reporters.push(reporter);
    }

    return mgr;
  }

  /**
   * Validate all reporters.
   * Returns list of validation errors. Empty array = all valid.
   */
  validate(): Array<{ reporter: string; error: string }> {
    const errors: Array<{ reporter: string; error: string }> = [];

    for (const reporter of this.reporters) {
      if (typeof reporter.validate === 'function') {
        const result = reporter.validate();
        if (!result.valid) {
          errors.push({
            reporter: reporter.name,
            error: result.error ?? 'Unknown validation error'
          });
        }
      }
    }

    return errors;
  }

  /**
   * Returns true if the cli (console) reporter is active.
   * Used by CLI to decide whether to print validation diagnostics to console.
   */
  hasConsoleReporter(): boolean {
    return this.reporters.some(r => r.name === 'cli');
  }

  /**
   * Wire this manager to a CollectionRunner event emitter.
   * @param runner - EventEmitter from CollectionRunner
   * @param collection - The collection being run (needed for onRunStarted)
   */
  attach(runner: EventEmitter, collection: Collection): void {
    runner.on('beforeRun', (payload: EventPayloads['beforeRun']) => {
      this.onRunStarted(collection, payload.options);

      if (this.hasConsoleReporter()) {
        // Show validation diagnostics via stderr
        if (payload.validationResult?.valid === false && payload.validationResult.errors !== undefined) {
          process.stderr.write('\nValidation warnings detected:\n');
          for (const error of payload.validationResult.errors) {
            process.stderr.write(`  ${error.location}: ${error.message}\n`);
          }
          process.stderr.write('\n');
        }
      }
    });

    runner.on('afterRun', (payload: EventPayloads['afterRun']) => {
      this.onRunCompleted(payload.result);
    });

    runner.on('beforeIteration', (payload: EventPayloads['beforeIteration']) => {
      this.fanOut(r => r.onBeforeIteration?.(payload));
    });

    runner.on('afterIteration', (payload: EventPayloads['afterIteration']) => {
      this.fanOut(r => r.onAfterIteration?.(payload));
    });

    runner.on('beforeFolder', (payload: EventPayloads['beforeFolder']) => {
      this.fanOut(r => r.onBeforeFolder?.(payload));
    });

    runner.on('afterFolder', (payload: EventPayloads['afterFolder']) => {
      this.fanOut(r => r.onAfterFolder?.(payload));
    });

    runner.on('beforeItem', (payload: EventPayloads['beforeItem']) => {
      this.fanOut(r => r.onBeforeItem?.(payload));
    });

    runner.on('afterItem', (payload: EventPayloads['afterItem']) => {
      this.fanOut(r => r.onAfterItem?.(payload));
    });

    runner.on('beforeRequest', (payload: EventPayloads['beforeRequest']) => {
      this.fanOut(r => r.onBeforeRequest?.(payload));
    });

    runner.on('afterRequest', (payload: EventPayloads['afterRequest']) => {
      this.fanOut(r => r.onAfterRequest?.(payload));
    });

    runner.on('assertion', (payload: EventPayloads['assertion']) => {
      this.fanOut(r => r.onAssertion?.(payload));
    });

    runner.on('console', (payload: EventPayloads['console']) => {
      this.fanOut(r => r.onConsole?.(payload));
    });

    runner.on('exception', (payload: EventPayloads['exception']) => {
      this.fanOut(r => r.onException?.(payload));
    });

    runner.on('beforeCollectionPreScript', (payload: EventPayloads['beforeCollectionPreScript']) => {
      this.fanOut(r => r.onBeforeCollectionPreScript?.(payload));
    });

    runner.on('afterCollectionPreScript', (payload: EventPayloads['afterCollectionPreScript']) => {
      this.fanOut(r => r.onAfterCollectionPreScript?.(payload));
    });

    runner.on('beforeCollectionPostScript', (payload: EventPayloads['beforeCollectionPostScript']) => {
      this.fanOut(r => r.onBeforeCollectionPostScript?.(payload));
    });

    runner.on('afterCollectionPostScript', (payload: EventPayloads['afterCollectionPostScript']) => {
      this.fanOut(r => r.onAfterCollectionPostScript?.(payload));
    });

    runner.on('beforeFolderPreScript', (payload: EventPayloads['beforeFolderPreScript']) => {
      this.fanOut(r => r.onBeforeFolderPreScript?.(payload));
    });

    runner.on('afterFolderPreScript', (payload: EventPayloads['afterFolderPreScript']) => {
      this.fanOut(r => r.onAfterFolderPreScript?.(payload));
    });

    runner.on('beforeFolderPostScript', (payload: EventPayloads['beforeFolderPostScript']) => {
      this.fanOut(r => r.onBeforeFolderPostScript?.(payload));
    });

    runner.on('afterFolderPostScript', (payload: EventPayloads['afterFolderPostScript']) => {
      this.fanOut(r => r.onAfterFolderPostScript?.(payload));
    });

    runner.on('beforePreScript', (payload: EventPayloads['beforePreScript']) => {
      this.fanOut(r => r.onBeforePreScript?.(payload));
    });

    runner.on('afterPreScript', (payload: EventPayloads['afterPreScript']) => {
      this.fanOut(r => r.onAfterPreScript?.(payload));
    });

    runner.on('beforePostScript', (payload: EventPayloads['beforePostScript']) => {
      this.fanOut(r => r.onBeforePostScript?.(payload));
    });

    runner.on('afterPostScript', (payload: EventPayloads['afterPostScript']) => {
      this.fanOut(r => r.onAfterPostScript?.(payload));
    });
  }

  /**
   * Flush all reporters. Call this after the run completes.
   */
  async flush(): Promise<void> {
    await Promise.all(this.reporters.map(r => r.flush?.() ?? Promise.resolve()));
  }

  /**
   * Get all active reporter instances.
   */
  getReporters(): IReporter[] {
    return this.reporters;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private onRunStarted(collection: Collection, options: RunOptions): void {
    this.fanOut(r => r.onRunStarted(collection, options));
  }

  private onRunCompleted(result: RunResult): void {
    this.fanOut(r => r.onRunCompleted(result));
  }

  private fanOut(fn: (reporter: IReporter) => void): void {
    for (const reporter of this.reporters) {
      try {
        fn(reporter);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[ReporterManager] Reporter '${reporter.name}' threw: ${msg}\n`);
      }
    }
  }
}

// ============================================================================
// CLI flag parsing helpers
// ============================================================================

/**
 * Parse comma-or-repeat list of reporter names.
 * Input: ['cli,json', 'junit'] → ['cli', 'json', 'junit']
 */
export function parseReporterNames(raw: string[]): string[] {
  return raw.flatMap(r => r.split(',').map(s => s.trim())).filter(s => s.length > 0);
}

/**
 * Parse --reporter-export name=target entries.
 * Input: ['json=./reports/run.json', 'cli=stderr'] → [{ name:'json', target:'./reports/run.json' }, ...]
 */
export function parseReporterExports(raw: string[]): ReporterExport[] {
  return raw.map(entry => {
    const idx = entry.indexOf('=');
    if (idx === -1) {
      throw new Error(`Invalid --reporter-export format: '${entry}'. Expected: name=target`);
    }
    const name = entry.slice(0, idx).trim();
    const target = entry.slice(idx + 1).trim();
    if (name.length === 0 || target.length === 0) {
      throw new Error(`Invalid --reporter-export format: '${entry}'. Expected: name=target`);
    }
    return { name, target };
  });
}

/**
 * Parse --reporter-opt name.key=value entries.
 * Input: ['cli.color=false', 'html.title=Smoke Run'] → { cli: { color: 'false' }, html: { title: 'Smoke Run' } }
 * Values are coerced: 'true'/'false' → boolean, numeric strings → number.
 */
export function parseReporterOptions(raw: string[]): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const entry of raw) {
    const dotIdx = entry.indexOf('.');
    const eqIdx = entry.indexOf('=');

    if (dotIdx === -1 || eqIdx === -1 || eqIdx <= dotIdx) {
      throw new Error(`Invalid --reporter-opt format: '${entry}'. Expected: name.key=value`);
    }

    const reporterName = entry.slice(0, dotIdx).trim();
    const key = entry.slice(dotIdx + 1, eqIdx).trim();
    const rawValue = entry.slice(eqIdx + 1);

    if (reporterName.length === 0 || key.length === 0) {
      throw new Error(`Invalid --reporter-opt format: '${entry}'. Expected: name.key=value`);
    }

    const value = coerceValue(rawValue);

    result[reporterName] ??= {};
    result[reporterName][key] = value;
  }

  return result;
}

function coerceValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim().length > 0) return num;
  return raw;
}
