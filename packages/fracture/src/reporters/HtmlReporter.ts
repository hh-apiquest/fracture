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
 * HTML reporter - writes a standalone HTML report file.
 * Reporter name: 'html'
 * Requires --reporter-export html=<path>.
 */
export class HtmlReporter implements IReporter {
  readonly name = 'html';
  readonly version = '1.0.0';
  readonly description = 'Standalone HTML run report';
  readonly reportTypes: string[] = ['html'];
  readonly outputType = 'file' as const;

  private exportTarget: string | undefined;
  private title: string = 'Fracture Run Report';

  private result: RunResult | undefined;
  private collectionName: string = '';

  // -------------------------------------------------------------------------
  // IReporter — configure & validate
  // -------------------------------------------------------------------------

  configure(options: Record<string, unknown>, exportTarget?: string): void {
    this.exportTarget = exportTarget;
    if (typeof options.title === 'string' && options.title.length > 0) {
      this.title = options.title;
    }
  }

  validate(): { valid: boolean; error?: string } {
    if (this.exportTarget === undefined || this.exportTarget.length === 0) {
      return {
        valid: false,
        error: 'html reporter requires --reporter-export html=<path>. Use a file path.'
      };
    }
    if (this.exportTarget === 'stdout' || this.exportTarget === 'stderr') {
      // Allow stdout/stderr even for HTML (user's choice)
      return { valid: true };
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

    const html = this.buildHtml(this.result);

    const target = this.exportTarget;
    if (target === 'stdout') {
      process.stdout.write(html + '\n');
    } else if (target === 'stderr') {
      process.stderr.write(html + '\n');
    } else {
      await writeFile(target, html, 'utf-8');
    }
  }

  // -------------------------------------------------------------------------
  // HTML building
  // -------------------------------------------------------------------------

  private buildHtml(result: RunResult): string {
    const title = this.title;
    const collection = this.collectionName;
    const passed = result.passedTests;
    const failed = result.failedTests;
    const skipped = result.skippedTests;
    const total = result.totalTests;
    const duration = (result.duration / 1000).toFixed(2);
    const startTime = result.startTime.toISOString();
    const endTime = result.endTime.toISOString();
    const successfulReqs = result.requestResults.filter(r => r.success).length;
    const failedReqs = result.requestResults.filter(r => !r.success).length;
    const overallClass = failed > 0 ? 'fail' : 'pass';

    const requestsHtml = result.requestResults.map(req => this.buildRequestHtml(req)).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; color: #1a1a2e; background: #f5f5f7; }
    header { background: #1a1a2e; color: #fff; padding: 20px 24px; }
    header h1 { font-size: 22px; font-weight: 600; }
    header .meta { font-size: 13px; color: #a0a8c0; margin-top: 4px; }
    .summary { display: flex; gap: 16px; padding: 16px 24px; background: #fff; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; }
    .stat { display: flex; flex-direction: column; align-items: center; padding: 12px 20px; border-radius: 8px; min-width: 90px; }
    .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; opacity: .7; }
    .stat .value { font-size: 28px; font-weight: 700; margin-top: 2px; }
    .stat.pass { background: #f0fdf4; color: #16a34a; }
    .stat.fail { background: #fef2f2; color: #dc2626; }
    .stat.skip { background: #f8fafc; color: #64748b; }
    .stat.neutral { background: #f1f5f9; color: #334155; }
    .status-banner { padding: 10px 24px; font-weight: 600; font-size: 15px; }
    .status-banner.pass { background: #dcfce7; color: #15803d; }
    .status-banner.fail { background: #fee2e2; color: #b91c1c; }
    .requests { padding: 16px 24px; display: flex; flex-direction: column; gap: 8px; }
    .request { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .request-header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; cursor: pointer; user-select: none; }
    .request-header:hover { background: #f8fafc; }
    .badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
    .badge.pass { background: #dcfce7; color: #15803d; }
    .badge.fail { background: #fee2e2; color: #b91c1c; }
    .badge.warn { background: #fef9c3; color: #854d0e; }
    .request-header .name { flex: 1; font-weight: 500; }
    .request-header .code { font-size: 13px; color: #64748b; }
    .request-header .dur { font-size: 12px; color: #94a3b8; }
    .request-body { border-top: 1px solid #f1f5f9; padding: 10px 16px; display: none; }
    .request-body.open { display: block; }
    .tests { list-style: none; }
    .tests li { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .tests li:last-child { border-bottom: none; }
    .tests li .t-badge { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
    .tests li .t-badge.pass { background: #dcfce7; color: #15803d; }
    .tests li .t-badge.fail { background: #fee2e2; color: #b91c1c; }
    .tests li .t-badge.skip { background: #f1f5f9; color: #64748b; }
    .tests li .t-err { color: #dc2626; font-size: 12px; margin-top: 2px; display: block; }
    .error-msg { color: #b91c1c; font-size: 12px; padding: 6px 0; }
    footer { padding: 12px 24px; color: #94a3b8; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Collection: ${escapeHtml(collection)} &bull; Started: ${escapeHtml(startTime)} &bull; Ended: ${escapeHtml(endTime)}</div>
  </header>

  <div class="status-banner ${overallClass}">
    ${failed > 0 ? 'Run completed with failures' : 'Run completed successfully'}
  </div>

  <div class="summary">
    <div class="stat neutral">
      <span class="label">Duration</span>
      <span class="value">${escapeHtml(duration)}s</span>
    </div>
    <div class="stat neutral">
      <span class="label">Requests</span>
      <span class="value">${result.requestResults.length}</span>
    </div>
    <div class="stat pass">
      <span class="label">Req Passed</span>
      <span class="value">${successfulReqs}</span>
    </div>
    ${failedReqs > 0 ? `<div class="stat fail">
      <span class="label">Req Failed</span>
      <span class="value">${failedReqs}</span>
    </div>` : ''}
    <div class="stat neutral">
      <span class="label">Tests</span>
      <span class="value">${total}</span>
    </div>
    <div class="stat pass">
      <span class="label">Passed</span>
      <span class="value">${passed}</span>
    </div>
    ${failed > 0 ? `<div class="stat fail">
      <span class="label">Failed</span>
      <span class="value">${failed}</span>
    </div>` : ''}
    ${skipped > 0 ? `<div class="stat skip">
      <span class="label">Skipped</span>
      <span class="value">${skipped}</span>
    </div>` : ''}
  </div>

  <div class="requests">
    ${requestsHtml}
  </div>

  <footer>Generated by Fracture &bull; ${escapeHtml(new Date().toISOString())}</footer>

  <script>
    document.querySelectorAll('.request-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var body = header.nextElementSibling;
        if (body) body.classList.toggle('open');
      });
    });
  </script>
</body>
</html>`;
  }

  private buildRequestHtml(req: RequestResult): string {
    const outcome = req.success ? 'pass' : 'fail';
    const code = req.summary.code ?? '';
    const label = req.summary.label ?? '';
    const codeLabel = code !== '' ? `${code} ${label}` : (req.success ? 'OK' : 'FAIL');
    const dur = `${req.duration}ms`;
    const errorMsg = req.summary.outcome === 'error'
      ? (req.summary.message ?? req.scriptError ?? '')
      : (req.scriptError ?? '');

    const testsHtml = req.tests.length > 0
      ? `<ul class="tests">${req.tests.map(t => this.buildTestHtml(t)).join('')}</ul>`
      : '';

    const bodyContent = [
      errorMsg.length > 0 ? `<div class="error-msg">${escapeHtml(errorMsg)}</div>` : '',
      testsHtml
    ].filter(s => s.length > 0).join('\n');

    return `
    <div class="request">
      <div class="request-header">
        <span class="badge ${outcome}">${outcome.toUpperCase()}</span>
        <span class="name">${escapeHtml(req.requestName)}</span>
        <span class="code">${escapeHtml(String(codeLabel))}</span>
        <span class="dur">${escapeHtml(dur)}</span>
      </div>
      ${bodyContent.length > 0 ? `<div class="request-body">${bodyContent}</div>` : ''}
    </div>`;
  }

  private buildTestHtml(test: TestResult): string {
    const cls = test.skipped ? 'skip' : (test.passed ? 'pass' : 'fail');
    const label = test.skipped ? 'SKIP' : (test.passed ? 'PASS' : 'FAIL');
    const errHtml = !test.passed && !test.skipped && test.error !== undefined && test.error.length > 0
      ? `<span class="t-err">${escapeHtml(test.error)}</span>`
      : '';
    return `<li><span class="t-badge ${cls}">${label}</span>${escapeHtml(test.name)}${errHtml}</li>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
