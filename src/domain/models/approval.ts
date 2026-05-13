export type DiffStatus = "pending" | "approved" | "rejected";

export interface DiffProposal {
  id: string;
  sessionId: string;
  relativePath: string;
  originalContent: string;
  proposedContent: string;
  diffText: string;
  status: DiffStatus;
  createdAt: string;
}
