/**
 * Agent CLI presence check.
 *
 * Verifies that the executable required by the selected non-mock runtime is
 * available on PATH before the harness starts. This avoids cryptic "command
 * not found" errors deep inside an agentic loop run.
 *
 * @param runtimeName - The selected agent runtime name.
 * @param spawnSyncFn - Optional `spawnSync` implementation for testing.
 */

import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';

export type AgentCliSpawnSyncFn = (
  command: string,
  args?: ReadonlyArray<string> | SpawnSyncOptionsWithStringEncoding,
  options?: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

const SUPPORTED_RUNTIMES = [
  'mock',
  'droid',
  'kilo',
  'codex',
  'bob-shell',
] as const;

type SupportedRuntime = (typeof SUPPORTED_RUNTIMES)[number];

const INSTALL_HINTS: Record<SupportedRuntime, string | undefined> = {
  mock: undefined,
  droid: undefined,
  kilo: 'npm install -g @kilocode/cli',
  codex: 'npm install -g @openai/codex',
  'bob-shell': 'curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash',
};

const CLI_NAMES: Record<SupportedRuntime, string | undefined> = {
  mock: undefined,
  droid: 'droid',
  kilo: 'kilo',
  codex: 'codex',
  'bob-shell': 'bob',
};

export function checkAgentCli(
  runtimeName: string,
  spawnSyncFn: AgentCliSpawnSyncFn = spawnSync as AgentCliSpawnSyncFn,
): void {
  if (runtimeName === 'mock') {
    return;
  }

  if (!SUPPORTED_RUNTIMES.includes(runtimeName as SupportedRuntime)) {
    throw new Error(`Unsupported runtime: ${runtimeName}`);
  }

  const supported = runtimeName as SupportedRuntime;
  const cliName = CLI_NAMES[supported];
  const installHint = INSTALL_HINTS[supported];

  if (!cliName) {
    return;
  }

  const result: SpawnSyncReturns<string> = spawnSyncFn(
    cliName,
    ['--version'],
    {
      encoding: 'utf8',
      shell: false,
    },
  );

  if (result.error || result.status !== 0) {
    const hint = installHint
      ? ` Install it with: ${installHint}`
      : ` Ensure ${cliName} is installed and on PATH.`;
    throw new Error(
      `Agent CLI "${cliName}" is required for runtime "${runtimeName}" but was not found on PATH.${hint}`,
    );
  }
}
