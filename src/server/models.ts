import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { readEnv } from "./env";

/** What a model is used for. Each role's model is set by an environment variable. */
export type ModelRole = "vision_fast" | "vision_strong" | "text";

const ROLES: Record<ModelRole, { env: string; fallback: string }> = {
  vision_fast: { env: "VISION_FAST_MODEL", fallback: "claude-haiku-4-5" },
  vision_strong: { env: "VISION_STRONG_MODEL", fallback: "claude-opus-5-5" },
  text: { env: "TEXT_MODEL", fallback: "claude-opus-5-5" },
};

export function modelFor(role: ModelRole): string {
  return readEnv(ROLES[role].env) ?? ROLES[role].fallback;
}

let client: Anthropic | undefined;

/** Resolves ANTHROPIC_API_KEY from the environment. Server only. */
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ImageInput = { data: string; mediaType: "image/png" | "image/jpeg" };
export type Content = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;
export type Usage = { inputTokens: number; outputTokens: number };

export const text = (value: string): Content => ({ type: "text", text: value });
export const image = (input: ImageInput): Content => ({
  type: "image",
  source: { type: "base64", media_type: input.mediaType, data: input.data },
});

/** Haiku 4.5 takes neither an effort level nor server-side fallbacks. */
const isHaiku = (model: string) => model.startsWith("claude-haiku");

export type StructuredRequest<S extends z.ZodType> = {
  model: string;
  system: string;
  content: Content[];
  schema: S;
  /** Thinking depth, for models that take it. Left to the model's default when omitted. */
  effort?: Effort;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type StructuredResponse<T> = {
  output: T;
  usage: Usage;
  /** The model that answered. Differs from the one asked when a fallback ran. */
  servedBy: string;
};

/**
 * One request that must come back as JSON matching `schema`.
 *
 * On models that support it, a request the model declines for safety reasons
 * is re-run on Anthropic's recommended fallback model inside the same call.
 * Throws on a refusal or an unparseable answer; callers wrap this in failSoft.
 */
export async function requestStructured<S extends z.ZodType>(
  request: StructuredRequest<S>,
): Promise<StructuredResponse<z.infer<S>>> {
  const { model, schema } = request;
  const options = {
    signal: request.signal,
    // The SDK rejects an explicit undefined here.
    ...(request.timeoutMs === undefined ? {} : { timeout: request.timeoutMs }),
  };
  const shared = {
    model,
    max_tokens: request.maxTokens ?? 16000,
    system: request.system,
    messages: [{ role: "user" as const, content: request.content }],
  };

  const response = isHaiku(model)
    ? await anthropic().messages.parse(
        { ...shared, output_config: { format: zodOutputFormat(schema) } },
        options,
      )
    : await anthropic().beta.messages.parse(
        {
          ...shared,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: {
            format: betaZodOutputFormat(schema),
            ...(request.effort ? { effort: request.effort } : {}),
          },
        },
        options,
      );

  if (response.stop_reason === "refusal") throw new Error(`${model} declined the request`);
  if (response.parsed_output === null || response.parsed_output === undefined) {
    throw new Error(`${model} returned no usable answer (stopped: ${response.stop_reason})`);
  }
  return {
    output: response.parsed_output as z.infer<S>,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    servedBy: response.model,
  };
}
