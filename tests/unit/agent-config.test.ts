import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateAgentConfig,
  writeAgentsJson,
  buildAgentConfig,
  type AgentConfig,
} from '../../src/agent-config.js';

describe('agent-config', () => {
  let tmpDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agent-config-test-'));
    workspaceDir = join(tmpDir, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('validateAgentConfig', () => {
    it('accepts mock runtime with no backend or credentials', () => {
      expect(() =>
        validateAgentConfig('mock', undefined, {}),
      ).not.toThrow();
    });

    it('rejects unsupported runtime', () => {
      expect(() => validateAgentConfig('unknown', undefined, {})).toThrow(
        'Unsupported runtime "unknown"',
      );
    });

    it('rejects unsupported backend', () => {
      expect(() => validateAgentConfig('kilo', 'azure', {})).toThrow(
        'Unsupported backend "azure"',
      );
    });

    it('rejects backend not allowed for runtime', () => {
      expect(() => validateAgentConfig('bob-shell', 'ollama', {})).toThrow(
        'Runtime "bob-shell" does not support backend "ollama"',
      );
    });

    it('accepts droid with openrouter backend when OPENROUTER_API_KEY is set', () => {
      expect(() =>
        validateAgentConfig('droid', 'openrouter', {
          OPENROUTER_API_KEY: 'sk-or-...',
        }),
      ).not.toThrow();
    });

    it('rejects droid openrouter backend when OPENROUTER_API_KEY is missing', () => {
      expect(() => validateAgentConfig('droid', 'openrouter', {})).toThrow(
        'OPENROUTER_API_KEY',
      );
    });

    it('accepts droid ollama backend with all Ollama env vars', () => {
      expect(() =>
        validateAgentConfig('droid', 'ollama', {
          OLLAMA_HOST: 'http://localhost:11434',
          OLLAMA_MODELS: 'llama3',
          OLLAMA_API_KEY: 'key',
        }),
      ).not.toThrow();
    });

    it('rejects droid ollama backend when OLLAMA_MODELS is missing', () => {
      expect(() =>
        validateAgentConfig('droid', 'ollama', {
          OLLAMA_HOST: 'http://localhost:11434',
          OLLAMA_API_KEY: 'key',
        }),
      ).toThrow('OLLAMA_MODELS');
    });

    it('accepts deprecated OLLAMA_MODEL fallback for droid ollama', () => {
      expect(() =>
        validateAgentConfig('droid', 'ollama', {
          OLLAMA_HOST: 'http://localhost:11434',
          OLLAMA_MODEL: 'llama3',
          OLLAMA_API_KEY: 'key',
        }),
      ).not.toThrow();
    });

    it('accepts kilo native backend with KILO_API_KEY', () => {
      expect(() =>
        validateAgentConfig('kilo', 'native', { KILO_API_KEY: 'sk-...' }),
      ).not.toThrow();
    });

    it('rejects kilo native backend when KILO_API_KEY is missing', () => {
      expect(() => validateAgentConfig('kilo', 'native', {})).toThrow(
        'KILO_API_KEY',
      );
    });

    it('accepts kilo openrouter backend with OPENROUTER_API_KEY', () => {
      expect(() =>
        validateAgentConfig('kilo', 'openrouter', {
          OPENROUTER_API_KEY: 'sk-or-...',
        }),
      ).not.toThrow();
    });

    it('rejects kilo openrouter backend when OPENROUTER_API_KEY is missing', () => {
      expect(() => validateAgentConfig('kilo', 'openrouter', {})).toThrow(
        'OPENROUTER_API_KEY',
      );
    });

    it('accepts codex openrouter backend with CODEX_API_KEY and OPENROUTER_API_KEY', () => {
      expect(() =>
        validateAgentConfig('codex', 'openrouter', {
          CODEX_API_KEY: 'sk-...',
          OPENROUTER_API_KEY: 'sk-or-...',
        }),
      ).not.toThrow();
    });

    it('rejects codex openrouter backend when OPENROUTER_API_KEY is missing', () => {
      expect(() =>
        validateAgentConfig('codex', 'openrouter', {
          CODEX_API_KEY: 'sk-...',
        }),
      ).toThrow('OPENROUTER_API_KEY');
    });

    it('accepts codex native backend with CODEX_API_KEY', () => {
      expect(() =>
        validateAgentConfig('codex', 'native', { CODEX_API_KEY: 'sk-...' }),
      ).not.toThrow();
    });

    it('accepts bob-shell with BOBSHELL_API_KEY', () => {
      expect(() =>
        validateAgentConfig('bob-shell', undefined, {
          BOBSHELL_API_KEY: 'bob-key',
        }),
      ).not.toThrow();
    });

    it('rejects bob-shell when BOBSHELL_API_KEY is missing', () => {
      expect(() =>
        validateAgentConfig('bob-shell', undefined, {}),
      ).toThrow('BOBSHELL_API_KEY');
    });
  });

  describe('writeAgentsJson', () => {
    it('writes a normalized agents.json file', () => {
      const config: AgentConfig = {
        runtime: 'kilo',
        model: 'kilo-auto/free',
        backend: 'native',
        credentials: { KILO_API_KEY: 'sk-...' },
      };

      writeAgentsJson(workspaceDir, config);

      const configPath = join(workspaceDir, 'config', 'agents.json');
      expect(existsSync(configPath)).toBe(true);

      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed).toEqual({
        runtime: 'kilo',
        model: 'kilo-auto/free',
        backend: 'native',
        credentials: { KILO_API_KEY: 'sk-...' },
      });
    });

    it('omits undefined fields', () => {
      writeAgentsJson(workspaceDir, { runtime: 'mock' });

      const configPath = join(workspaceDir, 'config', 'agents.json');
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(parsed).toEqual({ runtime: 'mock' });
      expect(parsed.model).toBeUndefined();
      expect(parsed.backend).toBeUndefined();
      expect(parsed.credentials).toBeUndefined();
    });

    it('creates the config directory if it does not exist', () => {
      const newWorkspace = join(tmpDir, 'new-workspace');
      mkdirSync(newWorkspace, { recursive: true });

      writeAgentsJson(newWorkspace, { runtime: 'mock' });

      expect(existsSync(join(newWorkspace, 'config'))).toBe(true);
      expect(existsSync(join(newWorkspace, 'config', 'agents.json'))).toBe(
        true,
      );
    });
  });

  describe('buildAgentConfig', () => {
    it('builds mock config with no credentials', () => {
      const config = buildAgentConfig('mock', undefined, undefined, {});
      expect(config).toEqual({ runtime: 'mock' });
    });

    it('builds droid openrouter config with default model', () => {
      const config = buildAgentConfig(
        'droid',
        'openrouter',
        undefined,
        { OPENROUTER_API_KEY: 'sk-or-...' },
      );
      expect(config.runtime).toBe('droid');
      expect(config.backend).toBe('openrouter');
      expect(config.model).toBe('openrouter/free-router');
      expect(config.credentials).toEqual({
        OPENROUTER_API_KEY: 'sk-or-...',
      });
    });

    it('builds droid ollama config with credentials and fallback model', () => {
      const config = buildAgentConfig('droid', 'ollama', undefined, {
        OLLAMA_HOST: 'http://localhost:11434',
        OLLAMA_MODEL: 'llama3',
        OLLAMA_API_KEY: 'key',
      });
      expect(config.backend).toBe('ollama');
      expect(config.credentials).toEqual({
        OLLAMA_HOST: 'http://localhost:11434',
        OLLAMA_MODELS: 'llama3',
        OLLAMA_API_KEY: 'key',
      });
    });

    it('builds kilo native config with default model', () => {
      const config = buildAgentConfig('kilo', undefined, undefined, {
        KILO_API_KEY: 'sk-...',
      });
      expect(config.runtime).toBe('kilo');
      expect(config.backend).toBe('native');
      expect(config.model).toBe('kilo-auto/free');
      expect(config.credentials).toEqual({ KILO_API_KEY: 'sk-...' });
    });

    it('builds codex config with explicit model override', () => {
      const config = buildAgentConfig(
        'codex',
        'openrouter',
        'openrouter/custom',
        {
          CODEX_API_KEY: 'sk-...',
          OPENROUTER_API_KEY: 'sk-or-...',
        },
      );
      expect(config.model).toBe('openrouter/custom');
    });

    it('builds bob-shell config with BOBSHELL_API_KEY placeholder', () => {
      const config = buildAgentConfig('bob-shell', undefined, undefined, {});
      expect(config.runtime).toBe('bob-shell');
      expect(config.credentials).toEqual({ BOBSHELL_API_KEY: '' });
    });
  });
});
