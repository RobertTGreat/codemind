import { X } from "lucide-react";
import { useGitFileDiff } from "../../../application/use-cases/sessionQueries";
import { Button } from "../../components/button/Button";

interface GitDiffPreviewProps {
  projectRoot: string | null;
  path: string;
  staged: boolean;
  onClose: () => void;
}

export function GitDiffPreview({
  projectRoot,
  path,
  staged,
  onClose,
}: GitDiffPreviewProps) {
  const fileDiff = useGitFileDiff(projectRoot, path, staged);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#1f1f1f]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-100">{path}</p>
          <p className="text-[11px] text-zinc-500">
            {staged ? "Staged diff" : "Working tree diff"}
          </p>
        </div>
        <Button
          className="h-7 w-7 px-0"
          variant="ghost"
          icon={<X size={14} />}
          title="Close diff"
          onClick={onClose}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {fileDiff.isLoading ? (
          <p className="text-xs text-zinc-500">Loading diff...</p>
        ) : null}

        {fileDiff.error ? (
          <p className="rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-200">
            {fileDiff.error instanceof Error
              ? fileDiff.error.message
              : String(fileDiff.error)}
          </p>
        ) : null}

        {fileDiff.data ? (
          <pre className="whitespace-pre-wrap rounded bg-[#242424] p-3 font-mono text-xs leading-5 text-zinc-300">
            {fileDiff.data.diffText || "No textual diff available."}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
