import { describe, it, expect, vi } from 'vitest';
import { type SpawnSyncReturns } from 'node:child_process';
import {
  checkAgentCli,
  type AgentCliSpawnSyncFn,
} from '../../src/agent-cli-check.js';

function makeResult(
  partial: Partial<SpawnSyncReturns<string>>,
): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    ...partial,
  } as SpawnSyncReturns<string>;
}

describe('checkAgentCli', () => {
  it('does nothing for mock runtime', () => {
    const spawnSyncFn = vi.fn<AgentCliSpawnSyncFn>();
    expect(() => checkAgentCli('mock', spawnSyncFn)).not.toThrow();
    expect(spawnSyncFn).not.toHaveBeenCalled();
  });

  it('throws for an unknown runtime', () => {
    const spawnSyncFn = vi.fn<AgentCliSpawnSyncFn>();
    expect(() => checkAgentCli('unknown-runtime', spawnSyncFn)).toThrow(
      'Unsupported runtime: unknown-runtime',
    );
    expect(spawnSyncFn).not.toHaveBeenCalled();
  });

  it.each([
    ['kilo', 'kilo', 'npm install -g @kilocode/cli'],
    ['codex', 'codex', 'npm install -g @openai/codex'],
    ['bob-shell', 'bob', 'curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash'],
    ['droid', 'droid', undefined],
  ] as const)(
    'throws with install hint when %s CLI is missing',
    (runtime, cliName, installHint) => {
      const expectedHint = installHint
        ? `Install it with: ${installHint}`
        : `Ensure ${cliName} is installed and on PATH.`;
      const spawnSyncFn = vi.fn<AgentCliSpawnSyncFn>(() =>
        makeResult({ status: 1, error: new Error('ENOENT') }),
      );
      expect(() => checkAgentCli(runtime, spawnSyncFn)).toThrow(expectedHint);
      expect(spawnSyncFn).toHaveBeenCalledWith(
        cliName,
        ['--version'],
        expect.objectContaining({ encoding: 'utf8', shell: false }),
      );
    },
  );

  it.each([
    'droid',
    'kilo',
    'codex',
    'bob-shell',
  ] as const)('does not throw when %s CLI is present', (runtime) => {
    const cliName = runtime === 'bob-shell' ? 'bob' : runtime;
    const spawnSyncFn = vi.fn<AgentCliSpawnSyncFn>(() =>
      makeResult({ status: 0, stdout: '1.0.0' }),
    );
    expect(() => checkAgentCli(runtime, spawnSyncFn)).not.toThrow();
    expect(spawnSyncFn).toHaveBeenCalledWith(
      cliName,
      ['--version'],
      expect.objectContaining({ encoding: 'utf8', shell: false }),
    );
  });
});
