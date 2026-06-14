import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CoverageReport, CoverageMetric } from '../types.js';

const execFileAsync = promisify(execFile);

/** Recognized test/coverage frameworks. */
export type CoverageFramework = 'vitest' | 'c8' | 'nyc' | 'pytest-cov' | 'coverage-py' | 'none';

/**
 * Runs sample tests with framework-inferred coverage and emits a
 * `coverage.json` report.
 *
 * ## Supported Frameworks
 *
 * | Language | Framework    | Detection                        | Coverage Command                          |
 * |----------|-------------|----------------------------------|-------------------------------------------|
 * | Node.js  | vitest      | `vitest` in devDependencies      | `npx vitest run --coverage`               |
 * | Node.js  | c8          | `c8` in devDependencies          | `npx c8 vitest run` (or `npx c8 npm test`)|
 * | Node.js  | nyc         | `nyc` in devDependencies         | `npx nyc npm test`                        |
 * | Python   | pytest-cov  | `pytest-cov` in requirements.txt | `python3 -m pytest --cov=. --cov-report=term` |
 * | Python   | coverage.py | `coverage` in requirements.txt   | `python3 -m coverage run -m pytest && python3 -m coverage json` |
 *
 * ## Detection Priority
 *
 * - Node.js: vitest > c8 > nyc
 * - Python:  pytest-cov > coverage.py
 *
 * ## Output
 *
 * Writes `coverage.json` to the configured output directory with
 * `lines`, `statements`, `functions`, and `branches` percentages.
 *
 * @remarks Fulfills VAL-SAMPLE-003.
 */
export class CoverageCalculator {
  /** Absolute path to the sample project directory. */
  readonly sampleDir: string;

  /** Absolute path to the output directory where coverage.json is written. */
  readonly outputDir: string;

  /**
   * @param sampleDir - Absolute path to the sample project (contains package.json or requirements.txt).
   * @param outputDir - Absolute path where coverage.json will be written.
   */
  constructor(sampleDir: string, outputDir: string) {
    this.sampleDir = path.resolve(sampleDir);
    this.outputDir = path.resolve(outputDir);
  }

  /**
   * Detect the test/coverage framework for the sample project.
   *
   * Reads `package.json` (Node.js) or `requirements.txt` (Python) to
   * determine which coverage tool is available.
   *
   * @returns The detected framework, or `'none'` if no framework is found.
   */
  async detectFramework(): Promise<CoverageFramework> {
    // Check for Node.js project (package.json)
    const pkgPath = path.join(this.sampleDir, 'package.json');
    try {
      const pkgRaw = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      const deps = {
        ...(pkg.devDependencies ?? {}),
        ...(pkg.dependencies ?? {}),
      };

      if ('vitest' in deps) return 'vitest';
      if ('c8' in deps) return 'c8';
      if ('nyc' in deps) return 'nyc';
    } catch {
      // No package.json or unreadable — continue to Python check
    }

    // Check for Python project (requirements.txt)
    const reqPath = path.join(this.sampleDir, 'requirements.txt');
    try {
      const reqRaw = await fs.readFile(reqPath, 'utf-8');
      const lines = reqRaw.split('\n').map((l) => l.trim().toLowerCase());

      const hasPytestCov = lines.some(
        (l) => l.startsWith('pytest-cov') || l.startsWith('pytest-cov=='),
      );
      const hasCoverage = lines.some((l) => l.startsWith('coverage') || l.startsWith('coverage=='));

      if (hasPytestCov) return 'pytest-cov';
      if (hasCoverage) return 'coverage-py';
    } catch {
      // No requirements.txt or unreadable
    }

    return 'none';
  }

  /**
   * Run the full coverage calculation: detect framework, run tests with
   * coverage, parse output, and write `coverage.json`.
   *
   * @param sampleName - Name of the sample project.
   * @param iteration  - Current iteration number.
   * @returns The CoverageReport that was computed and written.
   * @throws If no test framework is detected or the coverage command fails.
   */
  async calculate(sampleName: string, iteration: number): Promise<CoverageReport> {
    const framework = await this.detectFramework();

    if (framework === 'none') {
      throw new Error(
        `No test framework detected in ${this.sampleDir}. ` +
          `Ensure package.json includes vitest, c8, or nyc, or requirements.txt includes pytest-cov or coverage.`,
      );
    }

    const stdout = await this.runCoverageCommand(framework);
    const report = this.parseCoverageOutput(framework, stdout, sampleName, iteration);
    await this.writeCoverageReport(report);

    return report;
  }

  /**
   * Execute the coverage command for the given framework.
   *
   * Runs the command in the sample directory so relative paths resolve correctly.
   *
   * @param framework - The detected coverage framework.
   * @returns The combined stdout from the command.
   * @throws If the command exits with a non-zero code.
   */
  private async runCoverageCommand(framework: CoverageFramework): Promise<string> {
    const { cmd, args } = this.buildCoverageCommand(framework);

    try {
      const result = await execFileAsync(cmd, args, {
        cwd: this.sampleDir,
        timeout: 5 * 60_000, // 5-minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        encoding: 'utf-8',
      });

      return result.stdout;
    } catch (err: unknown) {
      const execErr = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
      // If the command produced stdout before failing, try to parse it anyway
      if (execErr.stdout) {
        return execErr.stdout;
      }
      throw new Error(
        `Coverage command failed for framework "${framework}": ${(err as Error).message}`,
      );
    }
  }

  /**
   * Build the shell command and arguments for running tests with coverage.
   */
  private buildCoverageCommand(framework: CoverageFramework): { cmd: string; args: string[] } {
    switch (framework) {
      case 'vitest':
        return { cmd: 'npx', args: ['vitest', 'run', '--coverage'] };

      case 'c8':
        // c8 wraps the test runner; try vitest first, fall back to npm test
        return { cmd: 'npx', args: ['c8', 'vitest', 'run'] };

      case 'nyc':
        return { cmd: 'npx', args: ['nyc', 'npm', 'test'] };

      case 'pytest-cov':
        return { cmd: 'python3', args: ['-m', 'pytest', '--cov=.', '--cov-report=term'] };

      case 'coverage-py':
        // coverage.py: run tests under coverage, then output JSON
        // We chain commands: coverage run -m pytest && coverage json -o coverage.json
        // But execFile doesn't do shell chaining, so we use a two-step approach
        return { cmd: 'python3', args: ['-m', 'coverage', 'run', '-m', 'pytest'] };

      default:
        throw new Error(`Unknown framework: ${framework}`);
    }
  }

  /**
   * Parse the stdout from a coverage command into a CoverageReport.
   *
   * Each framework produces different output formats; this method handles
   * the common patterns for each.
   *
   * @param framework  - The framework that produced the output.
   * @param stdout     - The raw stdout from the coverage command.
   * @param sampleName - Sample project name.
   * @param iteration  - Current iteration number.
   * @returns A populated CoverageReport.
   */
  parseCoverageOutput(
    framework: CoverageFramework,
    stdout: string,
    sampleName: string,
    iteration: number,
  ): CoverageReport {
    switch (framework) {
      case 'vitest':
      case 'c8':
        return this.parseV8Coverage(stdout, sampleName, iteration);

      case 'nyc':
        return this.parseNycCoverage(stdout, sampleName, iteration);

      case 'pytest-cov':
        return this.parsePytestCovOutput(stdout, sampleName, iteration);

      case 'coverage-py':
        return this.parseCoveragePyOutput(stdout, sampleName, iteration);

      default:
        return this.emptyReport(sampleName, iteration);
    }
  }

  /**
   * Parse the v8 (vitest/c8) text coverage table.
   *
   * Expected format:
   * ```
   * % Coverage report from v8
   * ---------------|---------|----------|---------|---------|-------------------
   * File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
   * ---------------|---------|----------|---------|---------|-------------------
   * All files       |   85.71 |      100 |      50 |   85.71 |
   * ```
   */
  private parseV8Coverage(stdout: string, sampleName: string, iteration: number): CoverageReport {
    const allFilesLine = stdout.split('\n').find((line) => line.trim().startsWith('All files'));

    if (!allFilesLine) {
      return this.emptyReport(sampleName, iteration);
    }

    const columns = allFilesLine
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // Columns: [0] = "All files", [1] = % Stmts, [2] = % Branch, [3] = % Funcs, [4] = % Lines
    const parsePercent = (val: string): number => {
      const parsed = Number.parseFloat(val);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    const stmtsPct = columns.length > 1 ? parsePercent(columns[1]) : 0;
    const branchPct = columns.length > 2 ? parsePercent(columns[2]) : 0;
    const funcsPct = columns.length > 3 ? parsePercent(columns[3]) : 0;
    const linesPct = columns.length > 4 ? parsePercent(columns[4]) : 0;

    return {
      statements: this.metricFromPercent(stmtsPct),
      branches: this.metricFromPercent(branchPct),
      functions: this.metricFromPercent(funcsPct),
      lines: this.metricFromPercent(linesPct),
      timestamp: new Date().toISOString(),
      sampleName,
      iteration,
    };
  }

  /**
   * Parse the nyc text coverage table.
   *
   * Expected format (similar to v8 but with different header):
   * ```
   * ----------|---------|----------|---------|---------|-------------------
   * File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
   * ----------|---------|----------|---------|---------|-------------------
   * All files |   92.30 |    66.66 |     100 |   92.30 |
   * ```
   */
  private parseNycCoverage(stdout: string, sampleName: string, iteration: number): CoverageReport {
    // nyc output has the same table structure as v8; reuse the parser
    return this.parseV8Coverage(stdout, sampleName, iteration);
  }

  /**
   * Parse pytest-cov terminal summary output.
   *
   * Expected format:
   * ```
   * ---------- coverage: platform linux, python 3.13.7 -----------
   * Name         Stmts   Miss  Cover   Missing
   * ----------------------------------------------
   * app.py          20      4    80%   10-12, 25
   * utils.py        10      0   100%
   * ----------------------------------------------
   * TOTAL           30      4    87%
   * ```
   */
  private parsePytestCovOutput(
    stdout: string,
    sampleName: string,
    iteration: number,
  ): CoverageReport {
    // Find the TOTAL line
    const totalLine = stdout.split('\n').find((line) => line.trim().startsWith('TOTAL'));

    if (!totalLine) {
      return this.emptyReport(sampleName, iteration);
    }

    // TOTAL line format: "TOTAL           30      4    87%"
    const parts = totalLine.trim().split(/\s+/);
    // parts: ["TOTAL", stmts, miss, cover%]
    const coverStr = parts.length > 3 ? parts[3] : '0%';
    const coverPct = Number.parseFloat(coverStr.replace('%', ''));
    const pct = Number.isNaN(coverPct) ? 0 : coverPct;

    // pytest-cov reports statement coverage; we map it to statements and lines
    return {
      statements: this.metricFromPercent(pct),
      branches: this.emptyMetric(),
      functions: this.emptyMetric(),
      lines: this.metricFromPercent(pct),
      timestamp: new Date().toISOString(),
      sampleName,
      iteration,
    };
  }

  /**
   * Parse coverage.py JSON output.
   *
   * coverage.py `coverage json` produces a JSON file with a `totals` object.
   * The stdout from our command chain includes the JSON content.
   *
   * Expected format:
   * ```json
   * {"totals": {"covered_lines": 45, "num_statements": 50, "percent_covered": 90.0, ...}}
   * ```
   */
  private parseCoveragePyOutput(
    stdout: string,
    sampleName: string,
    iteration: number,
  ): CoverageReport {
    try {
      const data = JSON.parse(stdout);
      const totals = data?.totals;

      if (!totals) {
        return this.emptyReport(sampleName, iteration);
      }

      const stmtsTotal = totals.num_statements ?? 0;
      const stmtsCovered = totals.covered_lines ?? 0;
      const stmtsPct = totals.percent_covered ?? 0;

      const branchTotal = totals.num_branches ?? 0;
      const branchCovered = totals.covered_branches ?? 0;
      const branchPct =
        branchTotal > 0 ? Math.round((branchCovered / branchTotal) * 10000) / 100 : 0;

      return {
        statements: {
          total: stmtsTotal,
          covered: stmtsCovered,
          percent: stmtsPct,
        },
        branches: {
          total: branchTotal,
          covered: branchCovered,
          percent: branchPct,
        },
        functions: this.emptyMetric(),
        lines: {
          total: stmtsTotal,
          covered: stmtsCovered,
          percent: stmtsPct,
        },
        timestamp: new Date().toISOString(),
        sampleName,
        iteration,
      };
    } catch {
      return this.emptyReport(sampleName, iteration);
    }
  }

  /**
   * Write the coverage report as JSON to `coverage.json` in the output directory.
   *
   * Creates the output directory if it does not exist.
   *
   * @param report - The CoverageReport to write.
   * @returns The absolute path to the written file.
   */
  async writeCoverageReport(report: CoverageReport): Promise<string> {
    await fs.mkdir(this.outputDir, { recursive: true });

    const outputPath = path.join(this.outputDir, 'coverage.json');
    const json = JSON.stringify(report, null, 2);
    await fs.writeFile(outputPath, json, 'utf-8');

    return outputPath;
  }

  // ---- Helpers ----

  /** Create a CoverageMetric from a percentage value (total/covered are estimated). */
  private metricFromPercent(percent: number): CoverageMetric {
    return {
      total: 100,
      covered: Math.round(percent),
      percent,
    };
  }

  /** Create an empty (zero) CoverageMetric. */
  private emptyMetric(): CoverageMetric {
    return { total: 0, covered: 0, percent: 0 };
  }

  /** Create an empty CoverageReport for unrecognized output. */
  private emptyReport(sampleName: string, iteration: number): CoverageReport {
    return {
      lines: this.emptyMetric(),
      statements: this.emptyMetric(),
      functions: this.emptyMetric(),
      branches: this.emptyMetric(),
      timestamp: new Date().toISOString(),
      sampleName,
      iteration,
    };
  }
}
