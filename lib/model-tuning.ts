type ModelSettings = {
  temperature?: number;
  topP?: number;
  topK?: number;
};

type ProviderOptions = Record<string, unknown>;

export type AgentModelTuning = {
  modelSettings?: ModelSettings;
  providerOptions?: ProviderOptions;
};

const OPENROUTER_HIGH_REASONING = {
  openrouter: {
    reasoning: {
      effort: "high",
    },
  },
} as const;

export function getModelTuning(modelId?: string): AgentModelTuning {
  const id = (modelId ?? "").toLowerCase();
  if (!id) return {};

  // Gemini models benefit from broader sampling and high reasoning effort.
  if (id.includes("gemini")) {
    return {
      modelSettings: {
        temperature: 1.0,
        topP: 0.95,
        topK: 64,
      },
      providerOptions: OPENROUTER_HIGH_REASONING,
    };
  }

  // Claude tends to be steadier for coding with lower temperature.
  if (id.includes("claude")) {
    return {
      modelSettings: {
        temperature: 0.3,
      },
      providerOptions: OPENROUTER_HIGH_REASONING,
    };
  }

  // GPT-5 / Codex: deterministic code edits with explicit reasoning.
  if (id.includes("gpt-5") || id.includes("codex")) {
    return {
      modelSettings: {
        temperature: 0.2,
        topP: 1,
      },
      providerOptions: OPENROUTER_HIGH_REASONING,
    };
  }

  // Qwen in this stack behaves better with moderate temperature.
  if (id.includes("qwen")) {
    return {
      modelSettings: {
        temperature: 0.55,
        topP: 1,
      },
    };
  }

  // Mimo / Minimax / GLM / Kimi generally respond better with higher entropy.
  if (
    id.includes("mimo") ||
    id.includes("minimax") ||
    id.includes("glm-") ||
    id.includes("kimi-k2")
  ) {
    return {
      modelSettings: {
        temperature: 1.0,
        topP: 0.95,
      },
    };
  }

  return {};
}

