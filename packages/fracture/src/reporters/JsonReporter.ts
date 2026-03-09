import { writeFile } from 'fs/promises';
import type {
  IReporter,
  Collection,
  RunOptions,
  RunResult
} from '@apiquest/types';

/**
 * JSON reporter - writes the full RunResult as JSON.
 * Reporter name: 'json'
 * Requires --reporter-export json=<stdout|stderr|path>, or defaults to stdout.
 */
export class JsonReporter implements IReporter {
  readonly name = 'json';
  readonly version = '1.0.0';
  readonly description = 'JSON run report output';
  readonly reportTypes: string[] = ['json'];
  readonly outputType = 'stdout-or-file' as const;

  private exportTarget: string | undefined;
  private sortKeys: boolean = false;
  private pretty: boolean = true;

  private result: RunResult | undefined;

  // -------------------------------------------------------------------------
  // IReporter — configure & validate
  // -------------------------------------------------------------------------

  configure(options: Record<string, unknown>, exportTarget?: string): void {
    this.exportTarget = exportTarget;
    if (typeof options.pretty === 'boolean') {
      this.pretty = options.pretty;
    }
    if (typeof options.sortKeys === 'boolean') {
      this.sortKeys = options.sortKeys;
    }
  }

  validate(): { valid: boolean; error?: string } {
    // json reporter works with any export target (stdout, stderr, or file)
    // No mandatory requirement — defaults to stdout if not specified
    return { valid: true };
  }

  // -------------------------------------------------------------------------
  // IReporter — lifecycle hooks
  // -------------------------------------------------------------------------

  onRunStarted(_collection: Collection, _options: RunOptions): void {
    // Nothing to do before run
  }

  onRunCompleted(result: RunResult): void {
    this.result = result;
  }

  async flush(): Promise<void> {
    if (this.result === undefined) return;

    const indent = this.pretty ? 2 : undefined;
    const replacer = this.sortKeys
      ? ((_key: string, value: unknown) => {
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return Object.fromEntries(
              Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
            );
          }
          return value;
        })
      : undefined;

    const json = JSON.stringify(this.result, replacer, indent);

    const target = this.exportTarget ?? 'stdout';

    if (target === 'stdout') {
      process.stdout.write(json + '\n');
    } else if (target === 'stderr') {
      process.stderr.write(json + '\n');
    } else {
      await writeFile(target, json, 'utf-8');
    }
  }
}
