import type { DiffProposal } from "../models/approval";

export type FileChangeStatus = "new" | "changed";

export interface FileChangeSummary {
  status: FileChangeStatus;
  proposal: DiffProposal;
}

export interface LineChangeAnnotation {
  lineNumber: number;
  status: FileChangeStatus;
  previousText: string | null;
}

export function createFileChangeSummaryByPath(
  proposals: DiffProposal[],
): Record<string, FileChangeSummary> {
  return proposals.reduce<Record<string, FileChangeSummary>>((summaryByPath, proposal) => {
    summaryByPath[proposal.relativePath] = {
      status: proposal.originalContent.length === 0 ? "new" : "changed",
      proposal,
    };
    return summaryByPath;
  }, {});
}

export function createLineChangeAnnotations(
  proposal: DiffProposal | null,
): LineChangeAnnotation[] {
  if (!proposal) {
    return [];
  }

  const originalLines = proposal.originalContent.split(/\r?\n/);
  const proposedLines = proposal.proposedContent.split(/\r?\n/);
  const maximumLineCount = Math.max(originalLines.length, proposedLines.length);
  const isNewFile = proposal.originalContent.length === 0;
  const annotations: LineChangeAnnotation[] = [];

  for (let lineIndex = 0; lineIndex < maximumLineCount; lineIndex += 1) {
    const previousText = originalLines[lineIndex] ?? null;
    const proposedText = proposedLines[lineIndex] ?? null;

    if (proposedText === null || previousText === proposedText) {
      continue;
    }

    annotations.push({
      lineNumber: lineIndex + 1,
      status: isNewFile || previousText === null ? "new" : "changed",
      previousText,
    });
  }

  return annotations;
}
