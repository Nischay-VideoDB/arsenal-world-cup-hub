// Model access — every model goes through TokenRouter (OpenAI-compatible gateway).
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const openRouterKey = process.env.OPEN_ROUTER_API_KEY;
const tokenRouterKey = process.env.TOKENROUTER_API_KEY;

export const tokenrouter = createOpenAICompatible({
  name: openRouterKey ? "openrouter" : "tokenrouter",
  apiKey: openRouterKey ?? tokenRouterKey ?? "",
  baseURL: openRouterKey ? "https://openrouter.ai/api/v1" : (process.env.TOKENROUTER_BASE_URL ?? "https://api.tokenrouter.com/v1"),
});

export const liveModelConfigured = Boolean(openRouterKey || tokenRouterKey);

export const MODELS = {
  agent: process.env.ARSENAL_AGENT_MODEL ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini",
  code: process.env.ARSENAL_CODE_MODEL ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini",
  fallback: process.env.ARSENAL_BRIEFING_MODEL ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini",
} as const;
