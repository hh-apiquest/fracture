import { writeFile } from 'fs/promises';
import type {
  IReporter,
  Collection,
  RunOptions,
  RunResult,
  RequestResult,
  TestResult
} from '@apiquest/types';

/**
 * JUnit XML reporter - writes results as JUnit-compatible XML.
 * Reporter name: 'junit'
 * Requires --reporter-export junit=<path> (file only; stdout/stderr also accepted).
 */
export class JunitReporter implements IReporter {
  readonly name = 'junit';
  readonly version = '1.0.0';
  readonly description = 'JUnit XML run report output';
  readonly reportTypes: string[] = ['junit'];
  readonly outputType = 'file' as const;

  private exportTarget: string | undefined;
  private suiteName: string | undefined;

  private result: RunResult | undefined;
  private collectionName: string = '';

  // -------------------------------------------------------------------------
  // IReporter — configure & validate
  // -------------------------------------------------------------------------

  configure(options: Record<string, unknown>, exportTarget?: string): void {
    this.exportTarget = exportTarget;
    if (typeof options.suiteName === 'string') {
      this.suiteName = options.suiteName;
    }
  }

  validate(): { valid: boolean; error?: string } {
    if (this.exportTarget === undefined || this.exportTarget.length === 0) {
      return {
        valid: false,
        error: 'junit reporter requires --reporter-export junit=<path>. Use a file path, stdout, or stderr.'
      };
    }
    return { valid: true };
  }

  // -------------------------------------------------------------------------
  // IReporter — lifecycle hooks
  // -------------------------------------------------------------------------

  onRunStarted(collection: Collection, _options: RunOptions): void {
    this.collectionName = collection.info.name;
  }

  onRunCompleted(result: RunResult): void {
    this.result = result;
  }

  async flush(): Promise<void> {
    if (this.result === undefined) return;
    if (this.exportTarget === undefined) return;

    const xml = this.buildXml(this.result);

    const target = this.exportTarget;
    if (target === 'stdout') {
      process.stdout.write(xml + '\n');
    } else if (target === 'stderr') {
      process.stderr.write(xml + '\n');
    } else {
      await writeFile(target, xml, 'utf-8');
    }
  }

  // -------------------------------------------------------------------------
  // XML building
  // -------------------------------------------------------------------------

  private buildXml(result: RunResult): string {
    const totalTests = result.totalTests;
    const totalFailures = result.failedTests;
    const totalTime = (result.duration / 1000).toFixed(3);
    const name = this.suiteName ?? this.collectionName;

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<testsuites name=${attr(name)} tests="${totalTests}" failures="${totalFailures}" time="${totalTime}">`);

    // Group request results by request name + path for testsuite grouping
    // Each unique request (across iterations) produces one testsuite
    const suiteMap = new Map<string, RequestResult[]>();
    for (const req of result.requestResults) {
      const key = req.requestName;
      let bucket = suiteMap.get(key);
      if (bucket === undefined) {
        bucket = [];
        suiteMap.set(key, bucket);
      }
      bucket.push(req);
    }

    for (const [reqName, requests] of suiteMap) {
      const suiteTests = requests.reduce((sum, r) => sum + r.tests.length, 0);
      const suiteFailures = requests.reduce(
        (sum, r) => sum + r.tests.filter(t => !t.passed && !t.skipped).length,
        0
      );
      const suiteTime = (requests.reduce((sum, r) => sum + r.duration, 0) / 1000).toFixed(3);
      const classname = requests[0]?.path ?? reqName;

      lines.push(
        `  <testsuite name=${attr(reqName)} tests="${suiteTests}" failures="${suiteFailures}" time="${suiteTime}">`
      );

      for (const req of requests) {
        for (const test of req.tests) {
          lines.push(...this.buildTestCase(test, classname, req.duration));
        }

        // If the request had an error and no tests, add a synthetic failure
        if (req.tests.length === 0 && !req.success) {
          const errorMsg = req.summary.message ?? 'Request failed';
          lines.push(`    <testcase name=${attr(reqName)} classname=${attr(classname)} time="0.000">`);
          lines.push(`      <failure message=${attr(errorMsg)}>${escapeXml(errorMsg)}</failure>`);
          lines.push(`    </testcase>`);
        }
      }

      lines.push('  </testsuite>');
    }

    lines.push('</testsuites>');
    return lines.join('\n');
  }

  private buildTestCase(test: TestResult, classname: string, requestDuration: number): string[] {
    const time = (requestDuration / 1000 / Math.max(1, 1)).toFixed(3);
    const lines: string[] = [];

    if (test.skipped) {
      lines.push(`    <testcase name=${attr(test.name)} classname=${attr(classname)} time="${time}">`);
      lines.push(`      <skipped/>`);
      lines.push(`    </testcase>`);
    } else if (!test.passed) {
      const errorMsg = test.error ?? 'Test failed';
      lines.push(`    <testcase name=${attr(test.name)} classname=${attr(classname)} time="${time}">`);
      lines.push(`      <failure message=${attr(errorMsg)}>${escapeXml(errorMsg)}</failure>`);
      lines.push(`    </testcase>`);
    } else {
      lines.push(`    <testcase name=${attr(test.name)} classname=${attr(classname)} time="${time}"/>`);
    }

    return lines;
  }
}

function attr(value: string): string {
  return `"${escapeXml(value)}"`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
