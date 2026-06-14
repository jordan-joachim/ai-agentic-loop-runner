import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import { SampleFVTPlanner } from './planner.js';
import { CoverageCalculator } from './coverage-calculator.js';
import { CoverageReviewer } from './coverage-reviewer.js';
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
export class SampleFVTRunner {
    config;
    planner;
    reviewer;
    /**
     * @param config - Sample FVT configuration (samples dir, thresholds, limits).
     */
    constructor(config) {
        this.config = config;
        this.planner = new SampleFVTPlanner(config.samplesDir);
        this.reviewer = new CoverageReviewer(config);
    }
    /**
     * Run the full sample FVT pipeline: discover samples, run coverage loops,
     * and aggregate results.
     *
     * @param outputDir - Directory where per-sample outputs and result.yaml are written.
     * @returns An aggregated result with per-sample details.
     */
    async run(outputDir) {
        const samples = await this.planner.discover();
        if (samples.length === 0) {
            await this.writeAggregateResult(outputDir, {
                status: 'error',
                totalSamples: 0,
                completedSamples: 0,
                failedSamples: 0,
                results: [],
            });
            return {
                status: 'error',
                totalSamples: 0,
                completedSamples: 0,
                failedSamples: 0,
                results: [],
            };
        }
        const results = [];
        for (const sample of samples) {
            try {
                const sampleResult = await this.runSampleLoop(sample.sampleName, sample.samplePath, outputDir);
                results.push(sampleResult);
            }
            catch (err) {
                const message = err.message;
                results.push({
                    sampleName: sample.sampleName,
                    status: 'error',
                    iterations: 0,
                    finalCoveragePercent: 0,
                    error: message,
                });
            }
        }
        const completedSamples = results.filter((r) => r.status === 'done').length;
        const failedSamples = results.filter((r) => r.status === 'error').length;
        const aggregate = {
            status: failedSamples > 0 ? 'partial' : 'done',
            totalSamples: results.length,
            completedSamples,
            failedSamples,
            results,
        };
        await this.writeAggregateResult(outputDir, aggregate);
        return aggregate;
    }
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
    async runSampleLoop(sampleName, samplePath, baseOutputDir) {
        const sampleOutputDir = path.join(baseOutputDir, 'samples', sampleName);
        await fs.mkdir(sampleOutputDir, { recursive: true });
        let previousCoveragePath = null;
        let finalCoveragePercent = 0;
        let finalReview;
        for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
            // ---- Calculate coverage ----
            const calculator = new CoverageCalculator(samplePath, sampleOutputDir);
            let report;
            try {
                report = await calculator.calculate(sampleName, iteration);
            }
            catch (err) {
                // If coverage calculation fails, treat as error and return
                return {
                    sampleName,
                    status: 'error',
                    iterations: iteration - 1,
                    finalCoveragePercent,
                    error: `Coverage calculation failed: ${err.message}`,
                };
            }
            finalCoveragePercent = report.lines.percent;
            // ---- Review coverage ----
            const currentCoveragePath = path.join(sampleOutputDir, 'coverage.json');
            const review = await this.reviewer.review(currentCoveragePath, previousCoveragePath, sampleName, iteration, sampleOutputDir);
            finalReview = review;
            if (review.status === 'done') {
                return {
                    sampleName,
                    status: 'done',
                    iterations: iteration,
                    finalCoveragePercent,
                    finalReview: review,
                };
            }
            // Prepare for next iteration — the current coverage becomes previous
            // Note: the coverage calculator writes coverage.json in the sample dir.
            // We need to copy/save iteration coverage for comparison.
            // The reviewer already writes review.yaml. For multi-iteration comparison,
            // we save a copy of the current coverage as the "previous" for next iteration.
            const iterationCoveragePath = path.join(sampleOutputDir, `coverage-iter-${iteration}.json`);
            const coverageContent = await fs.readFile(currentCoveragePath, 'utf-8');
            await fs.writeFile(iterationCoveragePath, coverageContent, 'utf-8');
            previousCoveragePath = iterationCoveragePath;
        }
        // Max iterations reached without done
        return {
            sampleName,
            status: 'incomplete',
            iterations: this.config.maxIterations,
            finalCoveragePercent,
            finalReview,
        };
    }
    /**
     * Write the aggregated result.yaml to the output directory.
     *
     * @param outputDir - Root output directory.
     * @param aggregate - The aggregated result to write.
     */
    async writeAggregateResult(outputDir, aggregate) {
        await fs.mkdir(outputDir, { recursive: true });
        const resultObj = {
            status: aggregate.status,
            total_samples: aggregate.totalSamples,
            completed_samples: aggregate.completedSamples,
            failed_samples: aggregate.failedSamples,
            samples: aggregate.results.map((r) => ({
                name: r.sampleName,
                status: r.status,
                iterations: r.iterations,
                coverage_percent: r.finalCoveragePercent,
                review_status: r.finalReview?.status ?? null,
                error: r.error ?? null,
            })),
        };
        const yamlContent = yaml.dump(resultObj, { lineWidth: -1, noRefs: true });
        const outputPath = path.join(outputDir, 'result.yaml');
        await fs.writeFile(outputPath, yamlContent, 'utf-8');
    }
}
//# sourceMappingURL=runner.js.map