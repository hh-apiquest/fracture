// Section 40: Reporter System Tests
// Tests for built-in reporters, ReporterManager, and CLI flag parsing

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, rm } from 'fs/promises';
import { randomUUID } from 'crypto';
import type { Collection, RunResult, IReporter, EventPayloads } from '@apiquest/types';
import {
  ConsoleReporter,
  JsonReporter,
  JunitReporter,
  HtmlReporter,
  ReporterManager,
  parseReporterNames,
  parseReporterExports,
  parseReporterOptions
} from '../src/reporters/index.js';

// ============================================================================
// Helpers
// ============================================================================

function makeCollection(name = 'Test Collection'): Collection {
  return {
    info: { id: 'col-1', name, version: '1.0.0' },
    protocol: 'http',
    items: []
  };
}

function makeRunResult(overrides: Partial<RunResult> = {}): RunResult {
  const now = new Date();
  return {
    collectionId: 'col-1',
    collectionName: 'Test Collection',
    startTime: now,
    endTime: new Date(now.getTime() + 1000),
    duration: 1000,
    requestResults: [
      {
        requestId: 'req-1',
        requestName: 'GET /users',
        path: 'request:/GET /users',
        success: true,
        duration: 245,
        iteration: 1,
        summary: { outcome: 'success', code: 200, label: 'OK', duration: 245 },
        tests: [
          { name: 'Status is 200', passed: true, skipped: false },
          { name: 'Response has data', passed: true, skipped: false }
        ]
      },
      {
        requestId: 'req-2',
        requestName: 'POST /users',
        path: 'request:/POST /users',
        success: false,
        duration: 189,
        iteration: 1,
        summary: { outcome: 'success', code: 400, label: 'Bad Request', duration: 189 },
        tests: [
          { name: 'Status is 201', passed: false, skipped: false, error: 'expected 400 to equal 201' },
          { name: 'Returns user ID', passed: false, skipped: false, error: 'response body missing id' }
        ]
      }
    ],
    totalTests: 4,
    passedTests: 2,
    failedTests: 2,
    skippedTests: 0,
    aborted: false,
    ...overrides
  };
}

// ============================================================================
// Section 40.1: Parsing helpers
// ============================================================================

describe('Section 40.1: CLI Parsing Helpers', () => {
  describe('parseReporterNames', () => {
    test('parses comma-separated string', () => {
      expect(parseReporterNames(['cli,json'])).toEqual(['cli', 'json']);
    });

    test('parses repeatable array', () => {
      expect(parseReporterNames(['cli', 'json', 'junit'])).toEqual(['cli', 'json', 'junit']);
    });

    test('parses mixed comma+repeat', () => {
      expect(parseReporterNames(['cli,json', 'junit'])).toEqual(['cli', 'json', 'junit']);
    });

    test('trims whitespace', () => {
      expect(parseReporterNames([' cli , json '])).toEqual(['cli', 'json']);
    });

    test('filters empty strings', () => {
      expect(parseReporterNames(['cli,,json'])).toEqual(['cli', 'json']);
    });
  });

  describe('parseReporterExports', () => {
    test('parses name=target format', () => {
      expect(parseReporterExports(['json=./reports/run.json'])).toEqual([
        { name: 'json', target: './reports/run.json' }
      ]);
    });

    test('parses stdout target', () => {
      expect(parseReporterExports(['json=stdout'])).toEqual([
        { name: 'json', target: 'stdout' }
      ]);
    });

    test('parses stderr target', () => {
      expect(parseReporterExports(['cli=stderr'])).toEqual([
        { name: 'cli', target: 'stderr' }
      ]);
    });

    test('parses multiple exports', () => {
      const result = parseReporterExports(['json=./run.json', 'junit=./junit.xml']);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'json', target: './run.json' });
      expect(result[1]).toEqual({ name: 'junit', target: './junit.xml' });
    });

    test('throws on missing = separator', () => {
      expect(() => parseReporterExports(['jsonstdout'])).toThrow('Invalid --reporter-export');
    });

    test('handles empty array', () => {
      expect(parseReporterExports([])).toEqual([]);
    });
  });

  describe('parseReporterOptions', () => {
    test('parses name.key=value format', () => {
      const result = parseReporterOptions(['cli.color=false']);
      expect(result).toEqual({ cli: { color: false } });
    });

    test('coerces boolean values', () => {
      const result = parseReporterOptions(['cli.color=true', 'cli.silent=false']);
      expect(result['cli']?.['color']).toBe(true);
      expect(result['cli']?.['silent']).toBe(false);
    });

    test('coerces numeric values', () => {
      const result = parseReporterOptions(['json.indent=4']);
      expect(result['json']?.['indent']).toBe(4);
    });

    test('keeps string values', () => {
      const result = parseReporterOptions(['html.title=My Report']);
      expect(result['html']?.['title']).toBe('My Report');
    });

    test('groups multiple options by reporter name', () => {
      const result = parseReporterOptions(['cli.color=false', 'html.title=Run', 'cli.silent=false']);
      expect(Object.keys(result)).toHaveLength(2);
      expect(result['cli']).toEqual({ color: false, silent: false });
      expect(result['html']).toEqual({ title: 'Run' });
    });

    test('throws on missing dot separator', () => {
      expect(() => parseReporterOptions(['clicolor=false'])).toThrow('Invalid --reporter-opt');
    });

    test('throws on missing = separator', () => {
      expect(() => parseReporterOptions(['cli.colorfalse'])).toThrow('Invalid --reporter-opt');
    });
  });
});

// ============================================================================
// Section 40.2: ConsoleReporter
// ============================================================================

describe('Section 40.2: ConsoleReporter', () => {
  test('has correct identity', () => {
    const r = new ConsoleReporter();
    expect(r.name).toBe('cli');
    expect(r.reportTypes).toContain('cli');
    expect(r.outputType).toBe('stdout');
  });

  test('configure() accepts color=false', () => {
    const r = new ConsoleReporter();
    r.configure({ color: false });
    // Verify no ANSI codes in output
    const lines: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      lines.push(String(data));
      return true;
    });
    r.onAssertion({
      id: '1', path: 'request:/test' as const, pathType: 'request',
      collectionInfo: { id: 'c', name: 'c', version: '1' },
      test: { name: 'My test', passed: true, skipped: false }
    } as EventPayloads['assertion']);
    writeSpy.mockRestore();
    expect(lines.join('')).toContain('[PASS]');
    expect(lines.join('')).not.toContain('\x1b[');
  });

  test('configure() routes to stderr', () => {
    const r = new ConsoleReporter();
    r.configure({}, 'stderr');
    const stderrLines: string[] = [];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      stderrLines.push(String(data));
      return true;
    });
    r.onRunStarted(makeCollection(), {} as import('@apiquest/types').RunOptions);
    writeSpy.mockRestore();
    expect(stderrLines.length).toBeGreaterThan(0);
  });

  test('validate() always returns valid', () => {
    const r = new ConsoleReporter();
    expect(r.validate()).toEqual({ valid: true });
  });

  test('flush() resolves immediately', async () => {
    const r = new ConsoleReporter();
    await expect(r.flush()).resolves.toBeUndefined();
  });

  test('silent mode suppresses output', () => {
    const r = new ConsoleReporter();
    r.configure({ silent: true });
    const lines: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      lines.push(String(data));
      return true;
    });
    r.onRunStarted(makeCollection(), {} as unknown as import('@apiquest/types').RunOptions);
    writeSpy.mockRestore();
    expect(lines).toHaveLength(0);
  });
});

// ============================================================================
// Section 40.3: JsonReporter
// ============================================================================

describe('Section 40.3: JsonReporter', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `fracture-test-${randomUUID()}.json`);
  });

  afterEach(async () => {
    await rm(tmpFile, { force: true });
  });

  test('has correct identity', () => {
    const r = new JsonReporter();
    expect(r.name).toBe('json');
    expect(r.reportTypes).toContain('json');
    expect(r.outputType).toBe('stdout-or-file');
  });

  test('validate() returns valid even without export path (defaults to stdout)', () => {
    const r = new JsonReporter();
    expect(r.validate().valid).toBe(true);
  });

  test('writes JSON to file on flush()', async () => {
    const r = new JsonReporter();
    r.configure({}, tmpFile);
    r.onRunStarted(makeCollection(), {} as unknown as import('@apiquest/types').RunOptions);
    r.onRunCompleted(makeRunResult());
    await r.flush();

    const content = await readFile(tmpFile, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    expect(typeof parsed).toBe('object');
    expect(parsed).toHaveProperty('collectionName', 'Test Collection');
    expect(parsed).toHaveProperty('totalTests', 4);
  });

  test('writes to stdout when target is stdout', async () => {
    const r = new JsonReporter();
    r.configure({}, 'stdout');
    r.onRunCompleted(makeRunResult());

    const chunks: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      chunks.push(String(data));
      return true;
    });

    await r.flush();
    writeSpy.mockRestore();

    const combined = chunks.join('');
    expect(combined.length).toBeGreaterThan(0);
    const parsed = JSON.parse(combined.trim()) as unknown;
    expect(parsed).toHaveProperty('collectionName');
  });

  test('flush() without onRunCompleted is a no-op', async () => {
    const r = new JsonReporter();
    r.configure({}, tmpFile);
    await expect(r.flush()).resolves.toBeUndefined();
  });
});

// ============================================================================
// Section 40.4: JunitReporter
// ============================================================================

describe('Section 40.4: JunitReporter', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `fracture-test-${randomUUID()}.xml`);
  });

  afterEach(async () => {
    await rm(tmpFile, { force: true });
  });

  test('has correct identity', () => {
    const r = new JunitReporter();
    expect(r.name).toBe('junit');
    expect(r.reportTypes).toContain('junit');
    expect(r.outputType).toBe('file');
  });

  test('validate() fails when no export path', () => {
    const r = new JunitReporter();
    const result = r.validate();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('--reporter-export junit=');
  });

  test('validate() passes when export path given', () => {
    const r = new JunitReporter();
    r.configure({}, tmpFile);
    expect(r.validate().valid).toBe(true);
  });

  test('writes valid XML to file on flush()', async () => {
    const r = new JunitReporter();
    r.configure({}, tmpFile);
    r.onRunStarted(makeCollection(), {} as unknown as import('@apiquest/types').RunOptions);
    r.onRunCompleted(makeRunResult());
    await r.flush();

    const content = await readFile(tmpFile, 'utf-8');
    expect(content).toContain('<?xml version="1.0"');
    expect(content).toContain('<testsuites');
    expect(content).toContain('</testsuites>');
    expect(content).toContain('GET /users');
    expect(content).toContain('POST /users');
    expect(content).toContain('Status is 200');
    expect(content).toContain('<failure');
    expect(content).toContain('expected 400 to equal 201');
  });

  test('XML escapes special characters', async () => {
    const r = new JunitReporter();
    r.configure({}, tmpFile);
    const result = makeRunResult({
      requestResults: [{
        requestId: 'req-1',
        requestName: 'GET /users & <friends>',
        path: 'request:/test' as const,
        success: true,
        duration: 100,
        iteration: 1,
        summary: { outcome: 'success', code: 200, label: 'OK' },
        tests: [{ name: 'Status is 200', passed: true, skipped: false }]
      }]
    });
    r.onRunCompleted(result);
    await r.flush();

    const content = await readFile(tmpFile, 'utf-8');
    expect(content).toContain('&amp;');
    expect(content).toContain('&lt;');
  });
});

// ============================================================================
// Section 40.5: HtmlReporter
// ============================================================================

describe('Section 40.5: HtmlReporter', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = join(tmpdir(), `fracture-test-${randomUUID()}.html`);
  });

  afterEach(async () => {
    await rm(tmpFile, { force: true });
  });

  test('has correct identity', () => {
    const r = new HtmlReporter();
    expect(r.name).toBe('html');
    expect(r.reportTypes).toContain('html');
    expect(r.outputType).toBe('file');
  });

  test('validate() fails when no export path', () => {
    const r = new HtmlReporter();
    const result = r.validate();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('--reporter-export html=');
  });

  test('writes standalone HTML to file', async () => {
    const r = new HtmlReporter();
    r.configure({ title: 'My Smoke Run' }, tmpFile);
    r.onRunStarted(makeCollection(), {} as unknown as import('@apiquest/types').RunOptions);
    r.onRunCompleted(makeRunResult());
    await r.flush();

    const content = await readFile(tmpFile, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('My Smoke Run');
    expect(content).toContain('GET /users');
    expect(content).toContain('POST /users');
    expect(content).toContain('Status is 200');
    expect(content).toContain('expected 400 to equal 201');
    expect(content).not.toContain('<script src=');  // No external scripts
  });

  test('HTML escapes request names', async () => {
    const r = new HtmlReporter();
    r.configure({}, tmpFile);
    const result = makeRunResult({
      requestResults: [{
        requestId: 'req-1',
        requestName: '<script>alert(1)</script>',
        path: 'request:/test' as const,
        success: true,
        duration: 100,
        iteration: 1,
        summary: { outcome: 'success', code: 200, label: 'OK' },
        tests: []
      }]
    });
    r.onRunCompleted(result);
    await r.flush();

    const content = await readFile(tmpFile, 'utf-8');
    expect(content).not.toContain('<script>alert(1)</script>');
    expect(content).toContain('&lt;script&gt;');
  });
});

// ============================================================================
// Section 40.6: ReporterManager
// ============================================================================

describe('Section 40.6: ReporterManager', () => {
  test('creates cli reporter by default', () => {
    const mgr = ReporterManager.create({});
    expect(mgr.getReporters()).toHaveLength(1);
    expect(mgr.getReporters()[0]?.name).toBe('cli');
  });

  test('creates multiple reporters', () => {
    const mgr = ReporterManager.create({ reporters: ['cli', 'json'] });
    const names = mgr.getReporters().map(r => r.name);
    expect(names).toContain('cli');
    expect(names).toContain('json');
  });

  test('throws on unknown reporter name', () => {
    expect(() => ReporterManager.create({ reporters: ['unknown-reporter'] })).toThrow('Unknown reporter');
  });

  test('validation fails for junit with no export path', () => {
    const mgr = ReporterManager.create({ reporters: ['junit'] });
    const errors = mgr.validate();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.reporter).toBe('junit');
  });

  test('validation passes when all reporters have what they need', () => {
    const mgr = ReporterManager.create({
      reporters: ['cli', 'json'],
      exports: [{ name: 'json', target: 'stdout' }]
    });
    expect(mgr.validate()).toHaveLength(0);
  });

  test('hasConsoleReporter() returns true when cli is active', () => {
    const mgr = ReporterManager.create({ reporters: ['cli'] });
    expect(mgr.hasConsoleReporter()).toBe(true);
  });

  test('hasConsoleReporter() returns false when cli not active', () => {
    const tmpFile = join(tmpdir(), `fracture-test-${randomUUID()}.json`);
    const mgr = ReporterManager.create({
      reporters: ['json'],
      exports: [{ name: 'json', target: 'stdout' }]
    });
    expect(mgr.hasConsoleReporter()).toBe(false);
  });

  test('noColor option configures cli reporter', () => {
    const mgr = ReporterManager.create({ reporters: ['cli'], noColor: true });
    const cli = mgr.getReporters().find(r => r.name === 'cli');
    expect(cli).toBeDefined();
    // Call onBeforeRequest and verify no ANSI codes
    const lines: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      lines.push(String(data));
      return true;
    });
    cli!.onBeforeRequest!({
      id: '1', path: 'request:/test' as const, pathType: 'request',
      collectionInfo: { id: 'c', name: 'c', version: '1' },
      request: { id: 'r1', name: 'My Request', data: { method: 'GET', url: 'http://example.com' } } as unknown as import('@apiquest/types').Request,
    } as EventPayloads['beforeRequest']);
    writeSpy.mockRestore();
    const output = lines.join('');
    expect(output).toContain('My Request');
    expect(output).not.toContain('\x1b[');
  });

  test('silent option configures cli reporter to suppress output', () => {
    const mgr = ReporterManager.create({ reporters: ['cli'], silent: true });
    const cli = mgr.getReporters().find(r => r.name === 'cli');
    const lines: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
      lines.push(String(data));
      return true;
    });
    cli!.onRunStarted(makeCollection(), {} as unknown as import('@apiquest/types').RunOptions);
    writeSpy.mockRestore();
    expect(lines).toHaveLength(0);
  });

  test('flush() calls flush on all reporters', async () => {
    let flushed = false;
    const mockReporter: IReporter = {
      name: 'mock',
      version: '1.0.0',
      description: 'Mock',
      reportTypes: ['mock'],
      outputType: 'stdout',
      onRunStarted: () => {},
      onRunCompleted: () => {},
      flush: async () => { flushed = true; }
    };
    const mgr = ReporterManager.create({ reporters: ['mock'], pluginReporters: [mockReporter] });
    await mgr.flush();
    expect(flushed).toBe(true);
  });

  test('plugin reporter passed via pluginReporters is available by name', () => {
    const mockReporter: IReporter = {
      name: 'slack',
      version: '1.0.0',
      description: 'Slack reporter',
      reportTypes: ['slack'],
      onRunStarted: () => {},
      onRunCompleted: () => {}
    };
    const mgr = ReporterManager.create({ reporters: ['slack'], pluginReporters: [mockReporter] });
    expect(mgr.getReporters().map(r => r.name)).toContain('slack');
  });
});
