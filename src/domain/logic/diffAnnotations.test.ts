import { describe, expect, it } from "vitest";
import type { DiffProposal } from "../models/approval";
import { createLineChangeAnnotations } from "./diffAnnotations";

describe("createLineChangeAnnotations", () => {
  it("does not mark shifted lines as changed after an insertion", () => {
    const proposal = createDiffProposal({
      originalContent: ["alpha", "bravo", "charlie"].join("\n"),
      proposedContent: ["alpha", "inserted", "bravo", "charlie"].join("\n"),
    });

    expect(createLineChangeAnnotations(proposal)).toEqual([
      {
        lineNumber: 2,
        previousText: null,
        status: "new",
      },
    ]);
  });

  it("pairs replacements with the previous line text", () => {
    const proposal = createDiffProposal({
      originalContent: ["alpha", "bravo", "charlie"].join("\n"),
      proposedContent: ["alpha", "delta", "charlie"].join("\n"),
    });

    expect(createLineChangeAnnotations(proposal)).toEqual([
      {
        lineNumber: 2,
        previousText: "bravo",
        status: "changed",
      },
    ]);
  });
});

function createDiffProposal({
  originalContent,
  proposedContent,
}: {
  originalContent: string;
  proposedContent: string;
}): DiffProposal {
  return {
    id: "proposal-id",
    sessionId: "session-id",
    relativePath: "src/example.ts",
    originalContent,
    proposedContent,
    diffText: "",
    status: "pending",
    createdAt: "2026-05-13T00:00:00.000Z",
  };
}
