import { describe, it, expect } from 'vitest';
import { SampleFVTPlanner } from '../../../src/sample-fvt/planner.js';
describe('SampleFVTPlanner', () => {
    it('discovers nodejs samples with package.json', async () => {
        const planner = new SampleFVTPlanner('tests/fixtures/samples');
        const samples = await planner.discover();
        const nodeSample = samples.find((s) => s.sampleName === 'nodejs-hello');
        expect(nodeSample).toBeDefined();
        expect(nodeSample.language).toBe('nodejs');
    });
    it('discovers python samples with requirements.txt', async () => {
        const planner = new SampleFVTPlanner('tests/fixtures/samples');
        const samples = await planner.discover();
        const pythonSample = samples.find((s) => s.sampleName === 'python-hello');
        expect(pythonSample).toBeDefined();
        expect(pythonSample.language).toBe('python');
    });
    it('skips directories without recognizable project files', async () => {
        const planner = new SampleFVTPlanner('tests/fixtures/samples');
        const samples = await planner.discover();
        const skipped = samples.find((s) => s.sampleName === 'empty');
        expect(skipped).toBeUndefined();
    });
    it('emits plans for discovered samples', async () => {
        const planner = new SampleFVTPlanner('tests/fixtures/samples');
        const planPaths = await planner.emitPlans('tests/output/plans');
        expect(planPaths.length).toBeGreaterThan(0);
        expect(planPaths.every((p) => p.endsWith('plan.yaml'))).toBe(true);
    });
});
//# sourceMappingURL=planner.test.js.map