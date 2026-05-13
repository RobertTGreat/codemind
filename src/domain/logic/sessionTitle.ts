export function createSessionTitle(prompt: string): string {
  const normalizedPrompt = prompt.trim().replace(/\s+/g, " ");
  if (normalizedPrompt.length === 0) {
    return "New coding session";
  }

  return normalizedPrompt.length > 42
    ? `${normalizedPrompt.slice(0, 42)}...`
    : normalizedPrompt;
}
