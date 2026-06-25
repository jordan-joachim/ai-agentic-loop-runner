/**
 * Agent configuration validation and delivery.
 *
 * The runner is the source of truth for runtime, model, backend/provider, and
 * credentials. This module validates the selected configuration and writes a
 * normalized `workspace/config/agents.json` file that the harness consumes
 * without rediscovering credentials or runtimes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AgentCredentials {
  [key: string]: string | undefined;
}

export interface AgentConfig {
  /** Global default runtime name */
  runtime: string;
  /** Global default model (optional) */
  model?: string;
  /** Global default backend/provider (optional) */
  backend?: string;
  /** Global default credentials (filled from env vars or placeholders) */
  credentials?: AgentCredentials;
}

const SUPPORTED_RUNTIMES = new Set([
  'mock',
  'droid',
  'kilo',
  'codex',
  'bob-shell',
]);

const SUPPORTED_BACKENDS = new Set(['native', 'openrouter', 'ollama']);

const RUNTIME_BACKENDS: Record<string, Set<string>> = {
  mock: new Set(),
  droid: SUPPORTED_BACKENDS,
  kilo: SUPPORTED_BACKENDS,
  codex: SUPPORTED_BACKENDS,
  'bob-shell': new Set(['native']),
};

const DEFAULT_BACKENDS: Record<string, string | undefined> = {
  droid: 'openrouter',
  kilo: 'native',
  codex: 'openrouter',
};

const DEFAULT_MODELS: Record<string, string | undefined> = {
  droid: 'openrouter/free-router',
  kilo: 'kilo-auto/free',
  codex: 'openrouter/free-router',
};

/**
 * Validate the selected runtime/backend combination and required credentials.
 *
 * @param runtime - The selected agent runtime name.
 * @param backend - Optional backend override. Defaults per runtime if omitted.
 * @param env - Environment variable map (defaults to process.env).
 * @throws When runtime/backend is unsupported or required credentials are missing.
 */
export function validateAgentConfig(
  runtime: string,
  backend: string | undefined,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!SUPPORTED_RUNTIMES.has(runtime)) {
    throw new Error(
      `Unsupported runtime "${runtime}". ` +
        `Supported runtimes are: ${[...SUPPORTED_RUNTIMES].join(', ')}.`,
    );
  }

  const effectiveBackend = (backend?.trim() || DEFAULT_BACKENDS[runtime] || '');

  if (effectiveBackend !== '') {
    if (!SUPPORTED_BACKENDS.has(effectiveBackend)) {
      throw new Error(
        `Unsupported backend "${effectiveBackend}" for runtime "${runtime}". ` +
          `Supported backends are: ${[...SUPPORTED_BACKENDS].join(', ')}.`,
      );
    }
  }

  const allowedBackends = RUNTIME_BACKENDS[runtime];
  if (effectiveBackend !== '' && !allowedBackends.has(effectiveBackend)) {
    throw new Error(
      `Runtime "${runtime}" does not support backend "${effectiveBackend}". ` +
        `Allowed backends are: ${[...allowedBackends].join(', ') || 'none'}.`,
    );
  }

  const missing: string[] = [];

  switch (runtime) {
    case 'mock':
      break;
    case 'droid': {
      const droidBackend = effectiveBackend || 'openrouter';
      if (droidBackend === 'ollama') {
        if (!env.OLLAMA_HOST?.trim()) missing.push('OLLAMA_HOST');
        if (!parseOllamaModels(env).length) missing.push('OLLAMA_MODELS');
        if (!env.OLLAMA_API_KEY?.trim()) missing.push('OLLAMA_API_KEY');
      } else if (droidBackend === 'openrouter') {
        if (!env.OPENROUTER_API_KEY?.trim()) missing.push('OPENROUTER_API_KEY');
      }
      break;
    }
    case 'kilo': {
      const kiloBackend = effectiveBackend || 'native';
      if (kiloBackend === 'ollama') {
        if (!env.OLLAMA_HOST?.trim()) missing.push('OLLAMA_HOST');
        if (!parseOllamaModels(env).length) missing.push('OLLAMA_MODELS');
        if (!env.OLLAMA_API_KEY?.trim()) missing.push('OLLAMA_API_KEY');
      } else if (kiloBackend === 'openrouter') {
        if (!env.OPENROUTER_API_KEY?.trim()) missing.push('OPENROUTER_API_KEY');
      } else {
        // native
        if (!env.KILO_API_KEY?.trim()) missing.push('KILO_API_KEY');
      }
      break;
    }
    case 'codex': {
      const codexBackend = effectiveBackend || 'openrouter';
      if (codexBackend === 'openrouter') {
        if (!env.CODEX_API_KEY?.trim()) missing.push('CODEX_API_KEY');
        if (!env.OPENROUTER_API_KEY?.trim()) missing.push('OPENROUTER_API_KEY');
      } else if (codexBackend === 'native') {
        if (!env.CODEX_API_KEY?.trim()) missing.push('CODEX_API_KEY');
      } else if (codexBackend === 'ollama') {
        if (!env.OLLAMA_HOST?.trim()) missing.push('OLLAMA_HOST');
        if (!parseOllamaModels(env).length) missing.push('OLLAMA_MODELS');
        if (!env.OLLAMA_API_KEY?.trim()) missing.push('OLLAMA_API_KEY');
      }
      break;
    }
    case 'bob-shell': {
      if (!env.BOBSHELL_API_KEY?.trim()) missing.push('BOBSHELL_API_KEY');
      break;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for runtime "${runtime}"` +
        (effectiveBackend ? ` (backend: ${effectiveBackend})` : '') +
        `: ${missing.join(', ')}. Set them before running the harness.`,
    );
  }
}

/**
 * Write a normalized `workspace/config/agents.json` file.
 *
 * @param workspaceDir - Absolute path to the workspace root directory.
 * @param config - The agent configuration to write.
 */
export function writeAgentsJson(
  workspaceDir: string,
  config: AgentConfig,
): void {
  const configDir = path.join(workspaceDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  const configPath = path.join(configDir, 'agents.json');
  const normalized: Record<string, unknown> = {
    runtime: config.runtime,
  };

  if (config.model !== undefined && config.model.trim() !== '') {
    normalized.model = config.model;
  }

  if (config.backend !== undefined && config.backend.trim() !== '') {
    normalized.backend = config.backend;
  }

  if (config.credentials !== undefined && Object.keys(config.credentials).length > 0) {
    normalized.credentials = config.credentials;
  }

  fs.writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
}

/**
 * Build an AgentConfig from environment variables.
 *
 * @param runtime - The selected runtime name.
 * @param backend - Optional backend override.
 * @param model - Optional model override.
 * @param env - Environment variable map (defaults to process.env).
 * @returns A normalized AgentConfig with credentials filled from env vars or placeholders.
 */
export function buildAgentConfig(
  runtime: string,
  backend: string | undefined,
  model: string | undefined,
  env: Record<string, string | undefined> = process.env,
): AgentConfig {
  const effectiveBackend = backend?.trim() || DEFAULT_BACKENDS[runtime] || undefined;
  const effectiveModel = model?.trim() || DEFAULT_MODELS[runtime] || undefined;

  const credentials: AgentCredentials = {};

  switch (runtime) {
    case 'mock':
      break;
    case 'droid': {
      const droidBackend = effectiveBackend || 'openrouter';
      if (droidBackend === 'ollama') {
        credentials.OLLAMA_HOST = env.OLLAMA_HOST?.trim() || '';
        credentials.OLLAMA_MODELS = env.OLLAMA_MODELS?.trim() || env.OLLAMA_MODEL?.trim() || '';
        credentials.OLLAMA_API_KEY = env.OLLAMA_API_KEY?.trim() || '';
      } else if (droidBackend === 'openrouter') {
        credentials.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY?.trim() || '';
      }
      break;
    }
    case 'kilo': {
      const kiloBackend = effectiveBackend || 'native';
      if (kiloBackend === 'ollama') {
        credentials.OLLAMA_HOST = env.OLLAMA_HOST?.trim() || '';
        credentials.OLLAMA_MODELS = env.OLLAMA_MODELS?.trim() || env.OLLAMA_MODEL?.trim() || '';
        credentials.OLLAMA_API_KEY = env.OLLAMA_API_KEY?.trim() || '';
      } else if (kiloBackend === 'openrouter') {
        credentials.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY?.trim() || '';
      } else {
        credentials.KILO_API_KEY = env.KILO_API_KEY?.trim() || '';
      }
      break;
    }
    case 'codex': {
      const codexBackend = effectiveBackend || 'openrouter';
      if (codexBackend === 'openrouter') {
        credentials.CODEX_API_KEY = env.CODEX_API_KEY?.trim() || '';
        credentials.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY?.trim() || '';
      } else if (codexBackend === 'native') {
        credentials.CODEX_API_KEY = env.CODEX_API_KEY?.trim() || '';
      } else if (codexBackend === 'ollama') {
        credentials.OLLAMA_HOST = env.OLLAMA_HOST?.trim() || '';
        credentials.OLLAMA_MODELS = env.OLLAMA_MODELS?.trim() || env.OLLAMA_MODEL?.trim() || '';
        credentials.OLLAMA_API_KEY = env.OLLAMA_API_KEY?.trim() || '';
      }
      break;
    }
    case 'bob-shell': {
      credentials.BOBSHELL_API_KEY = env.BOBSHELL_API_KEY?.trim() || '';
      break;
    }
  }

  const config: AgentConfig = {
    runtime,
  };

  if (effectiveModel) {
    config.model = effectiveModel;
  }

  if (effectiveBackend) {
    config.backend = effectiveBackend;
  }

  if (Object.keys(credentials).length > 0) {
    config.credentials = credentials;
  }

  return config;
}

function parseOllamaModels(
  env: Record<string, string | undefined>,
): string[] {
  const raw = env.OLLAMA_MODELS?.trim() || env.OLLAMA_MODEL?.trim() || '';
  if (!raw) return [];
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}
