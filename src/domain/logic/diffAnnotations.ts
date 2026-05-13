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

type LineEditOperation =
  | { kind: "equal"; originalText: string; proposedText: string }
  | { kind: "delete"; originalText: string }
  | { kind: "insert"; proposedText: string };

const MAX_EXACT_DIFF_CELLS = 250_000;

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
  const isNewFile = proposal.originalContent.length === 0;
  const annotations: LineChangeAnnotation[] = [];
  const lineEditOperations = createLineEditOperations(originalLines, proposedLines);
  const pendingDeletedLines: string[] = [];
  let proposedLineNumber = 1;

  for (const lineEditOperation of lineEditOperations) {
    if (lineEditOperation.kind === "equal") {
      pendingDeletedLines.length = 0;
      proposedLineNumber += 1;
      continue;
    }

    if (lineEditOperation.kind === "delete") {
      pendingDeletedLines.push(lineEditOperation.originalText);
      continue;
    }

    const previousText = pendingDeletedLines.shift() ?? null;
    annotations.push({
      lineNumber: proposedLineNumber,
      status: isNewFile || previousText === null ? "new" : "changed",
      previousText,
    });
    proposedLineNumber += 1;
  }

  return annotations;
}

function createLineEditOperations(
  originalLines: string[],
  proposedLines: string[],
): LineEditOperation[] {
  if (originalLines.length * proposedLines.length > MAX_EXACT_DIFF_CELLS) {
    return createIndexBasedLineEditOperations(originalLines, proposedLines);
  }

  const longestCommonSubsequenceLengths = Array.from(
    { length: originalLines.length + 1 },
    () => Array<number>(proposedLines.length + 1).fill(0),
  );

  for (let originalLineIndex = originalLines.length - 1; originalLineIndex >= 0; originalLineIndex -= 1) {
    for (let proposedLineIndex = proposedLines.length - 1; proposedLineIndex >= 0; proposedLineIndex -= 1) {
      if (originalLines[originalLineIndex] === proposedLines[proposedLineIndex]) {
        longestCommonSubsequenceLengths[originalLineIndex][proposedLineIndex] =
          longestCommonSubsequenceLengths[originalLineIndex + 1][proposedLineIndex + 1] + 1;
      } else {
        longestCommonSubsequenceLengths[originalLineIndex][proposedLineIndex] = Math.max(
          longestCommonSubsequenceLengths[originalLineIndex + 1][proposedLineIndex],
          longestCommonSubsequenceLengths[originalLineIndex][proposedLineIndex + 1],
        );
      }
    }
  }

  const lineEditOperations: LineEditOperation[] = [];
  let originalLineIndex = 0;
  let proposedLineIndex = 0;

  while (originalLineIndex < originalLines.length || proposedLineIndex < proposedLines.length) {
    if (
      originalLineIndex < originalLines.length &&
      proposedLineIndex < proposedLines.length &&
      originalLines[originalLineIndex] === proposedLines[proposedLineIndex]
    ) {
      lineEditOperations.push({
        kind: "equal",
        originalText: originalLines[originalLineIndex],
        proposedText: proposedLines[proposedLineIndex],
      });
      originalLineIndex += 1;
      proposedLineIndex += 1;
    } else if (
      proposedLineIndex < proposedLines.length &&
      (originalLineIndex === originalLines.length ||
        longestCommonSubsequenceLengths[originalLineIndex][proposedLineIndex + 1] >
          longestCommonSubsequenceLengths[originalLineIndex + 1][proposedLineIndex])
    ) {
      lineEditOperations.push({
        kind: "insert",
        proposedText: proposedLines[proposedLineIndex],
      });
      proposedLineIndex += 1;
    } else if (originalLineIndex < originalLines.length) {
      lineEditOperations.push({
        kind: "delete",
        originalText: originalLines[originalLineIndex],
      });
      originalLineIndex += 1;
    }
  }

  return lineEditOperations;
}

function createIndexBasedLineEditOperations(
  originalLines: string[],
  proposedLines: string[],
): LineEditOperation[] {
  const lineEditOperations: LineEditOperation[] = [];
  const maximumLineCount = Math.max(originalLines.length, proposedLines.length);

  for (let lineIndex = 0; lineIndex < maximumLineCount; lineIndex += 1) {
    const originalText = originalLines[lineIndex];
    const proposedText = proposedLines[lineIndex];
    if (originalText === proposedText && originalText !== undefined && proposedText !== undefined) {
      lineEditOperations.push({ kind: "equal", originalText, proposedText });
    } else {
      if (originalText !== undefined) {
        lineEditOperations.push({ kind: "delete", originalText });
      }
      if (proposedText !== undefined) {
        lineEditOperations.push({ kind: "insert", proposedText });
      }
    }
  }

  return lineEditOperations;
}
