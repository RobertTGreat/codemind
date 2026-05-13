import { Check, FileDiff, X } from "lucide-react";
import type { DiffProposal } from "../../../domain/models/approval";
import {
  useApproveDiff,
  usePendingDiffs,
  useRejectDiff,
} from "../../../application/use-cases/sessionQueries";
import { Button } from "../../components/button/Button";
import { Badge } from "../../components/badge/Badge";

interface ApprovalQueueProps {
  sessionId: string | null;
  selectedDiffId: string | null;
  onSelectDiff: (proposal: DiffProposal | null) => void;
  onNotify?: (notification: { title: string; description?: string; kind: "success" | "error" | "info" }) => void;
}

export function ApprovalQueue({
  sessionId,
  selectedDiffId,
  onSelectDiff,
  onNotify,
}: ApprovalQueueProps) {
  const pendingDiffs = usePendingDiffs(sessionId);
  const approveDiff = useApproveDiff(sessionId);
  const rejectDiff = useRejectDiff(sessionId);

  if (!sessionId) {
    return null;
  }

  const pendingProposalCount = pendingDiffs.data?.length ?? 0;

  function handleApproveProposal(proposal: DiffProposal) {
    approveDiff.mutate(proposal.id, {
      onSuccess: () =>
        onNotify?.({
          kind: "success",
          title: "Request approved",
          description: proposal.relativePath,
        }),
      onError: (error) =>
        onNotify?.({
          kind: "error",
          title: "Approval failed",
          description: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  function handleRejectProposal(proposal: DiffProposal) {
    rejectDiff.mutate(proposal.id, {
      onSuccess: () =>
        onNotify?.({
          kind: "info",
          title: "Request rejected",
          description: proposal.relativePath,
        }),
      onError: (error) =>
        onNotify?.({
          kind: "error",
          title: "Reject failed",
          description: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  return (
    <div className="border-t border-zinc-800 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <FileDiff size={13} />
          Requests
        </div>
        {pendingProposalCount > 0 ? (
          <Badge>{pendingProposalCount}</Badge>
        ) : (
          <span className="text-[11px] text-zinc-500">
            {pendingDiffs.isLoading ? "Checking..." : "No pending approvals"}
          </span>
        )}
      </div>

      {pendingProposalCount > 0 ? (
        <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
          {pendingDiffs.data?.map((proposal) => (
          <div
            key={proposal.id}
            className={`rounded border p-2 ${
              selectedDiffId === proposal.id ? "border-emerald-500" : "border-zinc-800"
            }`}
          >
              <div className="flex items-center gap-2">
                <button
                  className="min-w-0 flex-1 truncate text-left text-xs text-zinc-300"
                  onClick={() => onSelectDiff(proposal)}
                >
                  {proposal.relativePath}
                </button>
                <div className="flex gap-1">
                  <Button
                    className="h-6 px-2 text-[11px]"
                    variant="primary"
                    icon={<Check size={12} />}
                    onClick={() => handleApproveProposal(proposal)}
                  >
                    Approve
                  </Button>
                  <Button
                    className="h-6 px-2 text-[11px]"
                    variant="danger"
                    icon={<X size={12} />}
                    onClick={() => handleRejectProposal(proposal)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
