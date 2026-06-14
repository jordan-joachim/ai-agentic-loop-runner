import type { SamplePlan } from '../types.js';
export interface CompletionCriterion {
    id: string;
    description: string;
    test: string;
}
export interface SamplePlanWithCriteria extends SamplePlan {
    completion_criteria: CompletionCriterion[];
}
/**
 * Discovers IBM Code Engine AI sample projects under a mounted directory
 * and emits per-sample FVT plans with measurable coverage goals.
 *
 * ## Discovery Logic
 *
 * 1. Lists all entries under the configured `samplesDir` (expected to be `samples/ai/`).
 * 2. For each entry that is a directory:
 *    - Checks for `package.json` → language = `nodejs`.
 *    - Checks for `requirements.txt` → language = `python`.
 *    - If neither exists but the directory contains at least one source-like file
 *      (`.js`, `.ts`, `.py`, `.go`, `.java`, `.rb`, `.rs`, `.c`, `.cpp`, `.h`, `.sh`)
 *      → language = `unknown`.
 *    - Otherwise (empty directory, or only non-source files like README.md) → skipped.
 * 3. Files (non-directories) are skipped.
 *
 * ## Plan Emission
 *
 * For each discovered sample, emits a `plan.yaml` under `{outputDir}/samples/{name}/plan.yaml`
 * with:
 * - A measurable coverage goal (`coverage_percent >= 100`).
 * - Two completion criteria: 100% coverage and coverage stall (delta <= 5%).
 * - Input pointing to the sample source directory.
 * - Output pointing to `coverage.json`.
 *
 * @remarks Fulfills VAL-SAMPLE-001 (Discover AI samples) and VAL-SAMPLE-002 (Generate FVT plan per sample).
 */
export declare class SampleFVTPlanner {
    /** Absolute path to the samples/ai/ directory. */
    readonly samplesDir: string;
    /** File extensions considered as source code for "unknown" language detection. */
    private static readonly SOURCE_EXTENSIONS;
    /**
     * @param samplesDir - Absolute path to the samples/ai/ directory.
     */
    constructor(samplesDir: string);
    /**
     * Discover all sample projects under the configured samples directory.
     *
     * Scans subdirectories, identifies project language, and skips
     * non-project directories and files gracefully.
     *
     * @returns An array of SamplePlan objects, one per discovered project.
     *
     * @remarks Fulfills VAL-SAMPLE-001.
     */
    discover(): Promise<SamplePlan[]>;
    /**
     * Emit per-sample plan.yaml files under the given output directory.
     *
     * For each discovered sample, writes a `plan.yaml` at
     * `{outputDir}/samples/{sampleName}/plan.yaml` with the full Plan structure
     * (meta, goal, inputs, outputs, completion_criteria, rules).
     *
     * @param outputDir - Directory under which to write plan files.
     * @returns Array of absolute paths to the written plan.yaml files.
     *
     * @remarks Fulfills VAL-SAMPLE-002.
     */
    emitPlans(outputDir: string): Promise<string[]>;
    /**
     * Build a full Plan object from a SamplePlan for YAML emission.
     *
     * The emitted plan.yaml follows the standard Plan format so it can be
     * consumed by the harness loop controller.
     */
    private buildPlan;
    /**
     * Detect the project language for a sample directory.
     *
     * Priority:
     * 1. `package.json` exists → `nodejs`
     * 2. `requirements.txt` exists → `python`
     * 3. At least one source file with a recognized extension → `unknown`
     * 4. Otherwise → `null` (skip this directory)
     */
    private detectLanguage;
}
//# sourceMappingURL=planner.d.ts.map