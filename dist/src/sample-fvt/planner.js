import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
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
export class SampleFVTPlanner {
    /** Absolute path to the samples/ai/ directory. */
    samplesDir;
    /** File extensions considered as source code for "unknown" language detection. */
    static SOURCE_EXTENSIONS = new Set([
        '.js',
        '.ts',
        '.py',
        '.go',
        '.java',
        '.rb',
        '.rs',
        '.c',
        '.cpp',
        '.h',
        '.sh',
    ]);
    /**
     * @param samplesDir - Absolute path to the samples/ai/ directory.
     */
    constructor(samplesDir) {
        this.samplesDir = path.resolve(samplesDir);
    }
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
    async discover() {
        const plans = [];
        // If the samples directory does not exist, return empty.
        try {
            await fs.access(this.samplesDir);
        }
        catch {
            return plans;
        }
        const entries = await fs.readdir(this.samplesDir, { withFileTypes: true });
        for (const entry of entries) {
            // Skip non-directories (files, symlinks to files, etc.)
            if (!entry.isDirectory()) {
                continue;
            }
            const samplePath = path.join(this.samplesDir, entry.name);
            const language = await this.detectLanguage(samplePath);
            // Skip directories that don't look like projects
            if (language === null) {
                continue;
            }
            plans.push({
                sampleName: entry.name,
                samplePath,
                language,
                goal: {
                    description: `Achieve 100% FVT coverage for the ${entry.name} sample`,
                    measurable: 'coverage_percent >= 100',
                },
                completion_criteria: [
                    {
                        id: 'CC-001',
                        description: 'Coverage reaches 100%',
                        test: 'coverage_percent >= 100',
                    },
                    {
                        id: 'CC-002',
                        description: 'Coverage improvement stalls',
                        test: 'coverage_delta_percent <= 5',
                    },
                ],
            });
        }
        return plans;
    }
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
    async emitPlans(outputDir) {
        const samples = await this.discover();
        const writtenPaths = [];
        for (const sample of samples) {
            const planDir = path.join(outputDir, 'samples', sample.sampleName);
            await fs.mkdir(planDir, { recursive: true });
            const plan = this.buildPlan(sample);
            const planYaml = yaml.dump(plan, { lineWidth: -1, noRefs: true });
            const planPath = path.join(planDir, 'plan.yaml');
            await fs.writeFile(planPath, planYaml, 'utf-8');
            writtenPaths.push(planPath);
        }
        return writtenPaths;
    }
    /**
     * Build a full Plan object from a SamplePlan for YAML emission.
     *
     * The emitted plan.yaml follows the standard Plan format so it can be
     * consumed by the harness loop controller.
     */
    buildPlan(sample) {
        return {
            meta: {
                title: `FVT Coverage Plan for ${sample.sampleName}`,
                version: '1',
                author: 'sample-fvt-planner',
            },
            goal: {
                description: sample.goal.description,
                measurable: sample.goal.measurable,
            },
            inputs: [
                {
                    name: 'sample-source',
                    type: 'directory',
                    path: sample.samplePath,
                    description: `Source code for the ${sample.sampleName} sample`,
                },
            ],
            outputs: [
                {
                    name: 'coverage-report',
                    type: 'file',
                    path: 'coverage.json',
                    description: 'Coverage report in JSON format',
                },
            ],
            completion_criteria: sample.completion_criteria.map((cc) => ({
                id: cc.id,
                description: cc.description,
                test: cc.test,
            })),
            rules: [
                {
                    rule_id: 'RULE-FVT-001',
                    applies: true,
                },
            ],
        };
    }
    /**
     * Detect the project language for a sample directory.
     *
     * Priority:
     * 1. `package.json` exists → `nodejs`
     * 2. `requirements.txt` exists → `python`
     * 3. At least one source file with a recognized extension → `unknown`
     * 4. Otherwise → `null` (skip this directory)
     */
    async detectLanguage(samplePath) {
        let entries;
        try {
            entries = await fs.readdir(samplePath, { withFileTypes: true });
        }
        catch {
            // Cannot read directory — skip
            return null;
        }
        const fileNames = entries
            .filter((e) => e.isFile())
            .map((e) => e.name);
        // Check for package.json (Node.js)
        if (fileNames.includes('package.json')) {
            return 'nodejs';
        }
        // Check for requirements.txt (Python)
        if (fileNames.includes('requirements.txt')) {
            return 'python';
        }
        // Check for any source files with recognized extensions
        const hasSourceFiles = fileNames.some((name) => {
            const ext = path.extname(name).toLowerCase();
            return SampleFVTPlanner.SOURCE_EXTENSIONS.has(ext);
        });
        if (hasSourceFiles) {
            return 'unknown';
        }
        // No recognizable project files — skip
        return null;
    }
}
//# sourceMappingURL=planner.js.map