import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
/**
 * Compares current coverage with the previous iteration and signals `done`
 * when coverage reaches the configured threshold or the improvement delta
 * falls below the stall threshold.
 *
 * ## Done Criteria
 *
 * The reviewer signals `done` when either:
 * - `coveragePercent >= coverageThreshold` (default 100%), or
 * - `coverageDeltaPercent <= coverageStallDelta` (default 5%)
 *
 * The primary coverage metric used for comparison is **lines** coverage.
 *
 * ## Output
 *
 * Writes `review.yaml` to the configured output directory with:
 * - `status`: `done` or `incomplete`
 * - `coverage_percent`: current lines coverage percentage
 * - `coverage_delta_percent`: improvement since previous iteration
 * - `gaps`: list of gap descriptions (empty when done at 100%, populated
 *   when done due to stall or when incomplete)
 * - `iteration`: current iteration number
 * - `sample_name`: sample project name
 *
 * @remarks Fulfills VAL-SAMPLE-004 (stops at 100% coverage) and
 *          VAL-SAMPLE-005 (stops when coverage stalls).
 */
export class CoverageReviewer {
    config;
    /**
     * @param config - Sample FVT configuration with threshold and stall delta.
     */
    constructor(config) {
        this.config = config;
    }
    /**
     * Review current coverage against the previous iteration and emit a
     * `review.yaml` with the done/incomplete decision.
     *
     * @param currentCoveragePath  - Absolute path to the current iteration's `coverage.json`.
     * @param previousCoveragePath - Absolute path to the previous iteration's `coverage.json`,
     *                               or `null` if this is the first iteration.
     * @param sampleName           - Name of the sample project.
     * @param iteration            - Current iteration number.
     * @param outputDir            - Directory where `review.yaml` will be written.
     * @returns The CoverageReview that was computed and written.
     * @throws If the current coverage file cannot be read or parsed.
     * @throws If a previous coverage path is provided but the file cannot be read.
     */
    async review(currentCoveragePath, previousCoveragePath, sampleName, iteration, outputDir) {
        // Read current coverage (required)
        const currentReport = await this.readCoverageReport(currentCoveragePath, 'current coverage');
        // Read previous coverage (optional — null means first iteration)
        const previousReport = previousCoveragePath !== null
            ? await this.readCoverageReport(previousCoveragePath, 'previous coverage')
            : null;
        const currentPercent = currentReport.lines.percent;
        const previousPercent = previousReport?.lines.percent ?? 0;
        const deltaPercent = this.roundPercent(currentPercent - previousPercent);
        // Determine done status
        const reachedThreshold = currentPercent >= this.config.coverageThreshold;
        const stalled = deltaPercent <= this.config.coverageStallDelta;
        const status = (reachedThreshold || stalled) ? 'done' : 'incomplete';
        // Build gaps list
        const gaps = this.buildGaps(currentReport, status, reachedThreshold, stalled, deltaPercent);
        const review = {
            status,
            coveragePercent: currentPercent,
            coverageDeltaPercent: deltaPercent,
            gaps,
            iteration,
            sampleName,
        };
        await this.writeReviewYaml(review, outputDir);
        return review;
    }
    /**
     * Read and parse a coverage.json file.
     *
     * @param filePath - Absolute path to the coverage file.
     * @param label    - Human-readable label for error messages (e.g. "current coverage").
     * @returns The parsed CoverageReport.
     * @throws If the file cannot be read or parsed.
     */
    async readCoverageReport(filePath, label) {
        let raw;
        try {
            raw = await fs.readFile(filePath, 'utf-8');
        }
        catch (err) {
            throw new Error(`Failed to read ${label} file at "${filePath}": ${err.message}`);
        }
        let report;
        try {
            report = JSON.parse(raw);
        }
        catch (err) {
            throw new Error(`Failed to parse ${label} file at "${filePath}": ${err.message}`);
        }
        // Validate required fields exist
        if (!report.lines || typeof report.lines.percent !== 'number') {
            throw new Error(`${label} file at "${filePath}" is missing required "lines.percent" field`);
        }
        return report;
    }
    /**
     * Build the gaps list for the review.
     *
     * - When done at 100%: empty list (no gaps).
     * - When done due to stall: describes remaining uncovered areas and the stall.
     * - When incomplete: describes each metric that is below 100%.
     */
    buildGaps(report, status, reachedThreshold, stalled, deltaPercent) {
        if (status === 'done' && reachedThreshold) {
            // Coverage reached threshold — no gaps
            return [];
        }
        const gaps = [];
        // When done due to stall, add a stall explanation
        if (status === 'done' && stalled && !reachedThreshold) {
            gaps.push(`Coverage improvement stalled: delta of ${deltaPercent}% is within the ` +
                `${this.config.coverageStallDelta}% stall threshold. ` +
                `Current coverage is ${report.lines.percent}% (threshold: ${this.config.coverageThreshold}%).`);
        }
        // Add per-metric gap descriptions for metrics below 100%
        const metrics = [
            { name: 'lines', metric: report.lines },
            { name: 'statements', metric: report.statements },
            { name: 'functions', metric: report.functions },
            { name: 'branches', metric: report.branches },
        ];
        for (const { name, metric } of metrics) {
            if (metric.percent < 100) {
                const uncovered = metric.total - metric.covered;
                gaps.push(`${name}: ${metric.percent}% covered (${uncovered} of ${metric.total} uncovered)`);
            }
        }
        return gaps;
    }
    /**
     * Write the review as YAML to `review.yaml` in the output directory.
     *
     * Creates the output directory if it does not exist.
     *
     * @param review    - The CoverageReview to write.
     * @param outputDir - Directory where review.yaml will be written.
     * @returns The absolute path to the written file.
     */
    async writeReviewYaml(review, outputDir) {
        await fs.mkdir(outputDir, { recursive: true });
        const reviewYaml = {
            status: review.status,
            coverage_percent: review.coveragePercent,
            coverage_delta_percent: review.coverageDeltaPercent,
            gaps: review.gaps,
            iteration: review.iteration,
            sample_name: review.sampleName,
        };
        const yamlContent = yaml.dump(reviewYaml, { lineWidth: -1, noRefs: true });
        const outputPath = path.join(outputDir, 'review.yaml');
        await fs.writeFile(outputPath, yamlContent, 'utf-8');
        return outputPath;
    }
    /**
     * Round a percentage value to 2 decimal places.
     */
    roundPercent(value) {
        return Math.round(value * 100) / 100;
    }
}
//# sourceMappingURL=coverage-reviewer.js.map