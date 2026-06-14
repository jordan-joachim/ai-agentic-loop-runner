import type { CoverageReport } from '../types.js';
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
export declare class CoverageCalculator {
    /** Absolute path to the sample project directory. */
    readonly sampleDir: string;
    /** Absolute path to the output directory where coverage.json is written. */
    readonly outputDir: string;
    /**
     * @param sampleDir - Absolute path to the sample project (contains package.json or requirements.txt).
     * @param outputDir - Absolute path where coverage.json will be written.
     */
    constructor(sampleDir: string, outputDir: string);
    /**
     * Detect the test/coverage framework for the sample project.
     *
     * Reads `package.json` (Node.js) or `requirements.txt` (Python) to
     * determine which coverage tool is available.
     *
     * @returns The detected framework, or `'none'` if no framework is found.
     */
    detectFramework(): Promise<CoverageFramework>;
    /**
     * Run the full coverage calculation: detect framework, run tests with
     * coverage, parse output, and write `coverage.json`.
     *
     * @param sampleName - Name of the sample project.
     * @param iteration  - Current iteration number.
     * @returns The CoverageReport that was computed and written.
     * @throws If no test framework is detected or the coverage command fails.
     */
    calculate(sampleName: string, iteration: number): Promise<CoverageReport>;
    /**
     * Execute the coverage command for the given framework.
     *
     * Runs the command in the sample directory so relative paths resolve correctly.
     *
     * @param framework - The detected coverage framework.
     * @returns The combined stdout from the command.
     * @throws If the command exits with a non-zero code.
     */
    private runCoverageCommand;
    /**
     * Build the shell command and arguments for running tests with coverage.
     */
    private buildCoverageCommand;
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
    parseCoverageOutput(framework: CoverageFramework, stdout: string, sampleName: string, iteration: number): CoverageReport;
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
    private parseV8Coverage;
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
    private parseNycCoverage;
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
    private parsePytestCovOutput;
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
    private parseCoveragePyOutput;
    /**
     * Write the coverage report as JSON to `coverage.json` in the output directory.
     *
     * Creates the output directory if it does not exist.
     *
     * @param report - The CoverageReport to write.
     * @returns The absolute path to the written file.
     */
    writeCoverageReport(report: CoverageReport): Promise<string>;
    /** Create a CoverageMetric from a percentage value (total/covered are estimated). */
    private metricFromPercent;
    /** Create an empty (zero) CoverageMetric. */
    private emptyMetric;
    /** Create an empty CoverageReport for unrecognized output. */
    private emptyReport;
}
//# sourceMappingURL=coverage-calculator.d.ts.map