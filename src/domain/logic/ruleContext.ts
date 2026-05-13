interface RuleContextInput {
  globalRules: string;
  projectRules: string;
  projectRoot: string | null;
}

export function createAgentRuleContext({
  globalRules,
  projectRules,
  projectRoot,
}: RuleContextInput) {
  const normalizedGlobalRules = globalRules.trim();
  const normalizedProjectRules = projectRules.trim();
  const ruleSections: string[] = [];

  if (normalizedGlobalRules.length > 0) {
    ruleSections.push(`Global rules:\n${normalizedGlobalRules}`);
  }

  if (projectRoot && normalizedProjectRules.length > 0) {
    ruleSections.push(`Project rules for ${projectRoot}:\n${normalizedProjectRules}`);
  }

  return ruleSections.join("\n\n");
}
