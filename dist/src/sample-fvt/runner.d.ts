import type { CoverageReview, SampleFVTConfig } from '../types.js';
/**
 * Result for a single sample FVT run.
 */
export interface SampleResult {
    sampleName: string;
    status: 'done' | 'incomplete' | 'error';
    iterations: number;
    finalCoveragePercent: number;
    finalReview?: CoverageReview;
    error?: string;
}
/**
 * Aggregated result for all sample FVT runs.
 */
export interface SampleFVTAggregateResult {
    status: 'done' | 'partial' | 'error';
    totalSamples: number;
    completedSamples: number;
    failedSamples: number;
    results: SampleResult[];
}
/**
 * SampleFVTRunner orchestrates the coverage-driven loop over all discovered
 * AI sample projects.
 *
 * ## Flow
 *
 * 1. Discover sample projects under `{workspace}/inputs/code-engine-samples/samples/ai/`.
 * 2. For each discovered sample, run the coverage loop:
 *    a. Run the CoverageCalculator to produce `coverage.json`.
 *    b. Run the CoverageReviewer to compare with the previous iteration.
 *    c. If the reviewer signals `done`, stop the loop for this sample.
 *    d. Otherwise, loop back to (a) up to the configured max iterations.
 * 3. Write per-sample `coverage.json` and `review.yaml` under `{outputDir}/samples/{name}/`.
 * 4. Aggregate all results into a final `result.yaml` in the workspace.
 *
 * @remarks Implements the sample-fvt CLI subcommand expected behavior:
 *          scanning samples, running loops, producing per-sample coverage
 *          and review files, and aggregating final result.yaml.
 */
export declare class SampleFVTRunner {
    private readonly config;
    private readonly planner;
    private readonly reviewer;
    /**
     * @param config - Sample FVT configuration (samples dir, thresholds, limits).
     */
    constructor(config: SampleFVTConfig);
    /**
     * Run the full sample FVT pipeline: discover samples, run coverage loops,
     * and aggregate results.
     *
     * @param outputDir - Directory where per-sample outputs and result.yaml are written.
     * @returns An aggregated result with per-sample details.
     */
    run(outputDir: string): Promise<SampleFVTAggregateResult>;
    /**
     * Run the coverage-driven loop for a single sample.
     *
     * Iterates through the loop, running coverage calculation and review,
     * until the reviewer signals completion or max iterations are reached.
     *
     * @param sampleName - Name of the sample project.
     * @param samplePath - Absolute path to the sample source directory.
     * @param baseOutputDir - Root output directory.
     * @returns The result for this sample.
     */
    private runSampleLoop;
    /**
     * Write the aggregated result.yaml to the output directory.
     *
     * @param outputDir - Root output directory.
     * @param aggregate - The aggregated result to write.
     */
    private writeAggregateResult;
}
//# sourceMappingURL=runner.d.ts.map