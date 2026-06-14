import type { CoverageReview, SampleFVTConfig } from '../types.js';
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
export declare class CoverageReviewer {
    private readonly config;
    /**
     * @param config - Sample FVT configuration with threshold and stall delta.
     */
    constructor(config: SampleFVTConfig);
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
    review(currentCoveragePath: string, previousCoveragePath: string | null, sampleName: string, iteration: number, outputDir: string): Promise<CoverageReview>;
    /**
     * Read and parse a coverage.json file.
     *
     * @param filePath - Absolute path to the coverage file.
     * @param label    - Human-readable label for error messages (e.g. "current coverage").
     * @returns The parsed CoverageReport.
     * @throws If the file cannot be read or parsed.
     */
    private readCoverageReport;
    /**
     * Build the gaps list for the review.
     *
     * - When done at 100%: empty list (no gaps).
     * - When done due to stall: describes remaining uncovered areas and the stall.
     * - When incomplete: describes each metric that is below 100%.
     */
    private buildGaps;
    /**
     * Write the review as YAML to `review.yaml` in the output directory.
     *
     * Creates the output directory if it does not exist.
     *
     * @param review    - The CoverageReview to write.
     * @param outputDir - Directory where review.yaml will be written.
     * @returns The absolute path to the written file.
     */
    private writeReviewYaml;
    /**
     * Round a percentage value to 2 decimal places.
     */
    private roundPercent;
}
//# sourceMappingURL=coverage-reviewer.d.ts.map