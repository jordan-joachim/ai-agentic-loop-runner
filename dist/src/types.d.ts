/**
 * Local type mirrors for the Agentic Harness sample-fvt implementation.
 *
 * The original source imports types from '../types.js' inside the harness
 * repo. To keep the example self-contained without copying the entire
 * harness source tree, we re-export the equivalent types through a local
 * shim. The runtime values are only types, so this has no bundle impact.
 */
export interface PlanMeta {
    title: string;
    version: string;
    author: string;
}
export interface PlanGoal {
    description: string;
    measurable: string;
}
export interface PlanInput {
    name: string;
    type: 'file' | 'directory' | 'url';
    path: string;
    description: string;
}
export interface PlanOutput {
    name: string;
    type: 'file' | 'directory';
    path: string;
    description: string;
}
export interface PlanCompletionCriterion {
    id: string;
    description: string;
    test: string;
}
export interface PlanRuleRef {
    rule_id: string;
    applies: boolean;
}
export interface Plan {
    meta: PlanMeta;
    goal: PlanGoal;
    inputs: PlanInput[];
    outputs: PlanOutput[];
    completion_criteria: PlanCompletionCriterion[];
    rules: PlanRuleRef[];
}
export interface SamplePlan {
    sampleName: string;
    samplePath: string;
    language: 'nodejs' | 'python' | 'unknown';
    goal: {
        description: string;
        measurable: string;
    };
    completion_criteria: {
        id: string;
        description: string;
        test: string;
    }[];
}
export interface SampleFVTConfig {
    samplesDir: string;
    maxIterations: number;
    timeLimitMinutes: number;
    coverageThreshold: number;
    coverageStallDelta: number;
}
export interface CoverageMetric {
    total: number;
    covered: number;
    percent: number;
}
export interface CoverageReport {
    lines: CoverageMetric;
    statements: CoverageMetric;
    functions: CoverageMetric;
    branches: CoverageMetric;
    timestamp: string;
    sampleName: string;
    iteration: number;
}
export interface CoverageReview {
    status: 'done' | 'incomplete';
    coveragePercent: number;
    coverageDeltaPercent: number;
    gaps: string[];
    iteration: number;
    sampleName: string;
}
//# sourceMappingURL=types.d.ts.map