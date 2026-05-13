import { Effect } from "effect";

export function validatePrompt(prompt: string) {
  return Effect.gen(function* () {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length === 0) {
      return yield* Effect.fail(new Error("Type a message before sending."));
    }
    if (normalizedPrompt.length > 24_000) {
      return yield* Effect.fail(new Error("Prompt is too large for this session."));
    }
    return normalizedPrompt;
  });
}
