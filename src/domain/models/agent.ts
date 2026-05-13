export type AgentProviderId =
  | "codex-cli"
  | "claude-code"
  | "opencode"
  | "anthropic-direct"
  | "openai-direct";

export interface AgentProvider {
  id: AgentProviderId;
  name: string;
  description: string;
  isAvailable: boolean;
  models: AgentModelOption[];
  reasoningEfforts: AgentReasoningOption[];
}

export interface AgentModelOption {
  label: string;
  value: string;
}

export interface AgentReasoningOption {
  label: string;
  value: string;
}

export interface AgentMcpToolUsage {
  providerId: AgentProviderId;
  scope: "global" | "project" | "provider";
  title: string;
  detail: string;
  commandOrConfig: string;
}

export const copilotKitMcpServerUrl = "https://mcp.copilotkit.ai/mcp";

export const agentProviders: AgentProvider[] = [
  {
    id: "codex-cli",
    name: "Codex CLI",
    description: "Primary coding agent harness with approval gates.",
    isAvailable: true,
    models: [
      { label: "GPT-5.5", value: "gpt-5.5" },
      { label: "GPT-5.4", value: "gpt-5.4" },
      { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" },
    ],
    reasoningEfforts: [
      { label: "Medium", value: "medium" },
      { label: "Low", value: "low" },
      { label: "High", value: "high" },
      { label: "XHigh", value: "xhigh" },
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    description: "CLI harness adapter slot.",
    isAvailable: false,
    models: [
      { label: "Default", value: "default" },
      { label: "Sonnet", value: "sonnet" },
      { label: "Opus", value: "opus" },
    ],
    reasoningEfforts: [{ label: "Default", value: "medium" }],
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Open coding agent adapter slot.",
    isAvailable: false,
    models: [{ label: "Default", value: "default" }],
    reasoningEfforts: [{ label: "Default", value: "medium" }],
  },
  {
    id: "anthropic-direct",
    name: "Anthropic",
    description: "Direct SDK streaming adapter slot.",
    isAvailable: false,
    models: [
      { label: "Claude Sonnet", value: "claude-sonnet" },
      { label: "Claude Opus", value: "claude-opus" },
    ],
    reasoningEfforts: [{ label: "Default", value: "medium" }],
  },
  {
    id: "openai-direct",
    name: "OpenAI",
    description: "Direct Responses API streaming adapter slot.",
    isAvailable: false,
    models: [
      { label: "GPT-5.5", value: "gpt-5.5" },
      { label: "GPT-5.4", value: "gpt-5.4" },
      { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" },
    ],
    reasoningEfforts: [
      { label: "Medium", value: "medium" },
      { label: "Low", value: "low" },
      { label: "High", value: "high" },
      { label: "XHigh", value: "xhigh" },
    ],
  },
];

export const agentMcpToolUsage: AgentMcpToolUsage[] = [
  {
    providerId: "codex-cli",
    scope: "global",
    title: "Codex CLI",
    detail: "Add CopilotKit as a global HTTP MCP server in Codex config.",
    commandOrConfig: `[mcp_servers.copilotkit]
type = "http"
url = "${copilotKitMcpServerUrl}"`,
  },
  {
    providerId: "claude-code",
    scope: "provider",
    title: "Claude Code",
    detail: "Register the CopilotKit MCP server with Claude Code.",
    commandOrConfig: `claude mcp add --transport http copilotkit-mcp ${copilotKitMcpServerUrl}`,
  },
  {
    providerId: "opencode",
    scope: "provider",
    title: "OpenCode / MCP clients",
    detail: "Use the remote HTTP endpoint, or bridge it through mcp-remote when stdio is required.",
    commandOrConfig: `{
  "command": "npx",
  "args": ["mcp-remote", "${copilotKitMcpServerUrl}"]
}`,
  },
  {
    providerId: "anthropic-direct",
    scope: "provider",
    title: "Anthropic direct",
    detail: "Expose CopilotKit tools through the provider adapter's MCP client layer.",
    commandOrConfig: copilotKitMcpServerUrl,
  },
  {
    providerId: "openai-direct",
    scope: "provider",
    title: "OpenAI direct",
    detail: "Expose CopilotKit tools through the provider adapter's MCP client layer.",
    commandOrConfig: copilotKitMcpServerUrl,
  },
];

export const projectMcpToolUsage: AgentMcpToolUsage = {
  providerId: "codex-cli",
  scope: "project",
  title: "GitHub Copilot in this project",
  detail: "Create .vscode/mcp.json at the project root for VS Code and GitHub Copilot.",
  commandOrConfig: `{
  "servers": {
    "CopilotKit MCP": {
      "url": "${copilotKitMcpServerUrl}"
    }
  }
}`,
};
