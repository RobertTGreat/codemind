import type { AgentProviderId } from "./agent";

export interface Session {
  id: string;
  title: string;
  agentId: AgentProviderId;
  projectRoot: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface AgentTokenEvent {
  sessionId: string;
  messageId: string;
  token: string;
  isComplete: boolean;
  activityId?: string | null;
  activityMessage?: string | null;
  activityKind?: "thinking" | "tool" | "status" | "approval" | "error" | null;
  activityDetail?: string | null;
  activityOutput?: string | null;
}
