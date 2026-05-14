import {
  AlertCircle,
  Check,
  Cloud,
  Download,
  FileText,
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GitChangedFile,
  GitOperationResult,
  GitRepositoryStatus,
} from "../../../domain/models/git";
import {
  getGitOperationErrorMessage,
  getGitOperationOutput,
  useGitCommit,
  useGitDiscardPaths,
  useGitInitRepository,
  useGitPull,
  useGitPush,
  useGitSetRemote,
  useGitStagePaths,
  useGitStatus,
  useGitSync,
  useGitUnstagePaths,
} from "../../../application/use-cases/sessionQueries";
import { Badge } from "../../components/badge/Badge";
import { Button } from "../../components/button/Button";
import { GitDiffPreview } from "./GitDiffPreview";

interface GitSidebarProps {
  projectRoot: string | null;
  width: number;
  onResize: (width: number) => void;
}

type OperationStatus = {
  kind: "success" | "error";
  message: string;
  output: string;
};

interface SelectedGitDiffPreview {
  path: string;
  staged: boolean;
}

export function GitSidebar({ projectRoot, width, onResize }: GitSidebarProps) {
  const gitStatus = useGitStatus(projectRoot);
  const initRepository = useGitInitRepository(projectRoot);
  const setRemote = useGitSetRemote(projectRoot);
  const stagePaths = useGitStagePaths(projectRoot);
  const unstagePaths = useGitUnstagePaths(projectRoot);
  const discardPaths = useGitDiscardPaths(projectRoot);
  const commitChanges = useGitCommit(projectRoot);
  const pullChanges = useGitPull(projectRoot);
  const pushChanges = useGitPush(projectRoot);
  const syncChanges = useGitSync(projectRoot);
  const [remoteUrlInput, setRemoteUrlInput] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [operationStatus, setOperationStatus] = useState<OperationStatus | null>(null);
  const [selectedDiffPreview, setSelectedDiffPreview] =
    useState<SelectedGitDiffPreview | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const repositoryStatus = gitStatus.data;
  const displayedWidth = previewWidth ?? width;

  useEffect(() => {
    setRemoteUrlInput(repositoryStatus?.remoteUrl ?? "");
  }, [projectRoot, repositoryStatus?.remoteUrl]);

  useEffect(() => {
    setSelectedDiffPreview(null);
  }, [projectRoot]);

  const stagedFiles = useMemo(
    () => repositoryStatus?.changedFiles.filter((changedFile) => changedFile.isStaged) ?? [],
    [repositoryStatus?.changedFiles],
  );
  const unstagedFiles = useMemo(
    () =>
      repositoryStatus?.changedFiles.filter(
        (changedFile) => changedFile.isUnstaged && !changedFile.isUntracked,
      ) ?? [],
    [repositoryStatus?.changedFiles],
  );
  const untrackedFiles = useMemo(
    () => repositoryStatus?.changedFiles.filter((changedFile) => changedFile.isUntracked) ?? [],
    [repositoryStatus?.changedFiles],
  );
  const stageableFiles = useMemo(
    () =>
      repositoryStatus?.changedFiles.filter(
        (changedFile) => changedFile.isUnstaged || changedFile.isUntracked,
      ) ?? [],
    [repositoryStatus?.changedFiles],
  );
  const isOperationPending =
    initRepository.isPending ||
    setRemote.isPending ||
    stagePaths.isPending ||
    unstagePaths.isPending ||
    discardPaths.isPending ||
    commitChanges.isPending ||
    pullChanges.isPending ||
    pushChanges.isPending ||
    syncChanges.isPending;

  async function runGitOperation(operation: Promise<GitOperationResult>) {
    setOperationStatus(null);
    try {
      const gitOperationResult = await operation;
      setOperationStatus({
        kind: gitOperationResult.success ? "success" : "error",
        message: gitOperationResult.message,
        output: getGitOperationOutput(gitOperationResult),
      });
      await gitStatus.refetch();
      return gitOperationResult;
    } catch (error) {
      setOperationStatus({
        kind: "error",
        message: getGitOperationErrorMessage(error),
        output: "",
      });
      return null;
    }
  }

  async function commitStagedChanges() {
    const gitOperationResult = await runGitOperation(
      commitChanges.mutateAsync(commitMessage),
    );
    if (gitOperationResult?.success) {
      setCommitMessage("");
    }
  }

  function discardSelectedPaths(paths: string[]) {
    const fileLabel = paths.length === 1 ? paths[0] : `${paths.length} files`;
    const shouldDiscard = window.confirm(
      `Discard changes in ${fileLabel}? This cannot be undone.`,
    );
    if (shouldDiscard) {
      void runGitOperation(discardPaths.mutateAsync(paths));
    }
  }

  const trimmedRemoteUrl = remoteUrlInput.trim();
  const hasRemote = Boolean(repositoryStatus?.remoteUrl);
  const canPushCommits = Boolean(hasRemote && repositoryStatus?.hasCommits);
  const hasChanges = Boolean(repositoryStatus?.changedFiles.length);

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-[#181818]"
      style={{ width: displayedWidth }}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
        <GitBranch size={15} className="text-emerald-300" />
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">
          Source Control
        </div>
        <Button
          className="h-7 w-7 px-0"
          variant="ghost"
          title="Refresh Git status"
          icon={<RefreshCw size={13} />}
          disabled={!projectRoot || gitStatus.isFetching}
          onClick={() => void gitStatus.refetch()}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!projectRoot ? (
          <EmptyState
            icon={<GitBranch size={18} />}
            title="No project selected"
            body="Choose a session with a project folder to use Git."
          />
        ) : null}

        {projectRoot && gitStatus.isLoading ? (
          <p className="p-3 text-xs text-zinc-500">Reading Git status...</p>
        ) : null}

        {projectRoot && gitStatus.error ? (
          <Notice
            kind="error"
            title="Git status failed"
            body={getGitOperationErrorMessage(gitStatus.error)}
          />
        ) : null}

        {projectRoot && repositoryStatus && !repositoryStatus.isRepository ? (
          <div className="space-y-3">
            <EmptyState
              icon={<GitBranch size={18} />}
              title="No Git repository"
              body="Initialize this project to start tracking changes."
            />
            <Button
              className="h-8 w-full justify-start"
              variant="primary"
              icon={<Plus size={14} />}
              disabled={initRepository.isPending}
              onClick={() => void runGitOperation(initRepository.mutateAsync())}
            >
              Initialize repository
            </Button>
            <OperationNotice operationStatus={operationStatus} />
          </div>
        ) : null}

        {projectRoot && repositoryStatus?.isRepository ? (
          <div className="space-y-3">
            <RepositorySummary repositoryStatus={repositoryStatus} />

            <div className="grid grid-cols-3 gap-1.5">
              <Button
                className="h-8 px-2 text-xs"
                variant="secondary"
                icon={<Cloud size={13} />}
                disabled={!canPushCommits || isOperationPending}
                onClick={() => void runGitOperation(syncChanges.mutateAsync())}
              >
                Sync
              </Button>
              <Button
                className="h-8 px-2 text-xs"
                variant="secondary"
                icon={<Download size={13} />}
                disabled={!repositoryStatus.upstream || isOperationPending}
                onClick={() => void runGitOperation(pullChanges.mutateAsync())}
              >
                Pull
              </Button>
              <Button
                className="h-8 px-2 text-xs"
                variant="secondary"
                icon={<Upload size={13} />}
                disabled={!canPushCommits || isOperationPending}
                onClick={() => void runGitOperation(pushChanges.mutateAsync())}
              >
                Push
              </Button>
            </div>

            <RemoteSettings
              remoteUrlInput={remoteUrlInput}
              currentRemoteUrl={repositoryStatus.remoteUrl}
              isPending={setRemote.isPending}
              onChangeRemoteUrl={setRemoteUrlInput}
              onSaveRemote={() =>
                void runGitOperation(setRemote.mutateAsync(trimmedRemoteUrl))
              }
            />

            {repositoryStatus.hasConflicts ? (
              <Notice
                kind="error"
                title="Merge conflicts"
                body="Resolve conflicted files before committing or syncing."
              />
            ) : null}

            {!repositoryStatus.hasCommits ? (
              <Notice
                kind="info"
                title="Initial commit needed"
                body="Stage files and create the first commit before pushing or syncing this branch."
              />
            ) : null}

            <CommitPanel
              commitMessage={commitMessage}
              stagedCount={repositoryStatus.stagedCount}
              isPending={commitChanges.isPending}
              onChangeCommitMessage={setCommitMessage}
              onCommit={() => void commitStagedChanges()}
            />

            <OperationNotice operationStatus={operationStatus} />

            <GitFileSection
              title="Staged Changes"
              files={stagedFiles}
              emptyText="No staged changes."
              action={
                stagedFiles.length ? (
                  <Button
                    className="h-6 px-1.5 text-[11px]"
                    variant="ghost"
                    icon={<Minus size={11} />}
                    disabled={isOperationPending}
                    onClick={() =>
                      void runGitOperation(
                        unstagePaths.mutateAsync(stagedFiles.map((file) => file.path)),
                      )
                    }
                  >
                    Unstage All
                  </Button>
                ) : null
              }
            >
              {(changedFile) => (
                <GitFileRow
                  changedFile={changedFile}
                  onPreviewDiff={() =>
                    setSelectedDiffPreview({ path: changedFile.path, staged: true })
                  }
                  actions={
                    <>
                      <IconAction
                        title="Unstage"
                        icon={<Minus size={12} />}
                        disabled={isOperationPending}
                        onClick={() =>
                          void runGitOperation(
                            unstagePaths.mutateAsync([changedFile.path]),
                          )
                        }
                      />
                      <IconAction
                        title="Discard"
                        icon={<RotateCcw size={12} />}
                        disabled={isOperationPending}
                        danger
                        onClick={() => discardSelectedPaths([changedFile.path])}
                      />
                    </>
                  }
                />
              )}
            </GitFileSection>

            <GitFileSection
              title="Changes"
              files={unstagedFiles}
              emptyText="No modified tracked files."
              action={
                stageableFiles.length ? (
                  <Button
                    className="h-6 px-1.5 text-[11px]"
                    variant="ghost"
                    icon={<Plus size={11} />}
                    disabled={isOperationPending}
                    onClick={() =>
                      void runGitOperation(
                        stagePaths.mutateAsync(stageableFiles.map((file) => file.path)),
                      )
                    }
                  >
                    Stage All
                  </Button>
                ) : null
              }
            >
              {(changedFile) => (
                <GitFileRow
                  changedFile={changedFile}
                  onPreviewDiff={() =>
                    setSelectedDiffPreview({ path: changedFile.path, staged: false })
                  }
                  actions={
                    <>
                      <IconAction
                        title="Stage"
                        icon={<Plus size={12} />}
                        disabled={isOperationPending}
                        onClick={() =>
                          void runGitOperation(stagePaths.mutateAsync([changedFile.path]))
                        }
                      />
                      <IconAction
                        title="Discard"
                        icon={<RotateCcw size={12} />}
                        disabled={isOperationPending}
                        danger
                        onClick={() => discardSelectedPaths([changedFile.path])}
                      />
                    </>
                  }
                />
              )}
            </GitFileSection>

            <GitFileSection
              title="Untracked"
              files={untrackedFiles}
              emptyText="No untracked files."
            >
              {(changedFile) => (
                <GitFileRow
                  changedFile={changedFile}
                  onPreviewDiff={() =>
                    setSelectedDiffPreview({ path: changedFile.path, staged: false })
                  }
                  actions={
                    <>
                      <IconAction
                        title="Stage"
                        icon={<Plus size={12} />}
                        disabled={isOperationPending}
                        onClick={() =>
                          void runGitOperation(stagePaths.mutateAsync([changedFile.path]))
                        }
                      />
                      <IconAction
                        title="Delete"
                        icon={<RotateCcw size={12} />}
                        disabled={isOperationPending}
                        danger
                        onClick={() => discardSelectedPaths([changedFile.path])}
                      />
                    </>
                  }
                />
              )}
            </GitFileSection>

            {!hasChanges ? (
              <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
                Working tree clean.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {selectedDiffPreview ? (
        <GitDiffPreview
          projectRoot={projectRoot}
          path={selectedDiffPreview.path}
          staged={selectedDiffPreview.staged}
          onClose={() => setSelectedDiffPreview(null)}
        />
      ) : null}

      <SidebarResizeHandle
        initialWidth={width}
        onPreview={setPreviewWidth}
        onResize={onResize}
      />
    </aside>
  );
}

function RepositorySummary({
  repositoryStatus,
}: {
  repositoryStatus: GitRepositoryStatus;
}) {
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950 p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch size={13} className="shrink-0 text-emerald-300" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-100">
          {repositoryStatus.branch ?? "Detached HEAD"}
        </span>
        {repositoryStatus.ahead ? (
          <Badge className="px-1.5 py-0.5 text-[10px] text-sky-200">
            +{repositoryStatus.ahead}
          </Badge>
        ) : null}
        {repositoryStatus.behind ? (
          <Badge className="px-1.5 py-0.5 text-[10px] text-orange-200">
            -{repositoryStatus.behind}
          </Badge>
        ) : null}
      </div>
      <div className="space-y-1 text-[11px] leading-4 text-zinc-500">
        <p className="truncate">
          Upstream:{" "}
          <span className="text-zinc-300">{repositoryStatus.upstream ?? "not published"}</span>
        </p>
        <p className="truncate">
          Remote:{" "}
          <span className="text-zinc-300">{repositoryStatus.remoteUrl ?? "none"}</span>
        </p>
        {repositoryStatus.lastCommit ? (
          <p className="truncate">
            Last: <span className="text-zinc-300">{repositoryStatus.lastCommit}</span>
          </p>
        ) : (
          <p className="truncate">
            Last: <span className="text-zinc-300">no commits yet</span>
          </p>
        )}
      </div>
    </section>
  );
}

function RemoteSettings({
  remoteUrlInput,
  currentRemoteUrl,
  isPending,
  onChangeRemoteUrl,
  onSaveRemote,
}: {
  remoteUrlInput: string;
  currentRemoteUrl: string | null;
  isPending: boolean;
  onChangeRemoteUrl: (remoteUrl: string) => void;
  onSaveRemote: () => void;
}) {
  const trimmedRemoteUrl = remoteUrlInput.trim();
  const isRemoteUnchanged = trimmedRemoteUrl === (currentRemoteUrl ?? "");

  return (
    <section className="space-y-2">
      <label className="block text-[11px] font-medium uppercase text-zinc-500">
        GitHub remote
      </label>
      <div className="flex gap-1.5">
        <input
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          placeholder="https://github.com/owner/repo.git"
          value={remoteUrlInput}
          onChange={(event) => onChangeRemoteUrl(event.target.value)}
        />
        <Button
          className="h-8 shrink-0 px-2 text-xs"
          variant="secondary"
          icon={<Check size={12} />}
          disabled={!trimmedRemoteUrl || isRemoteUnchanged || isPending}
          onClick={onSaveRemote}
        >
          Save
        </Button>
      </div>
    </section>
  );
}

function CommitPanel({
  commitMessage,
  stagedCount,
  isPending,
  onChangeCommitMessage,
  onCommit,
}: {
  commitMessage: string;
  stagedCount: number;
  isPending: boolean;
  onChangeCommitMessage: (commitMessage: string) => void;
  onCommit: () => void;
}) {
  return (
    <section className="space-y-2">
      <textarea
        className="min-h-20 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
        placeholder="Commit message"
        value={commitMessage}
        onChange={(event) => onChangeCommitMessage(event.target.value)}
      />
      <Button
        className="h-8 w-full justify-center text-xs"
        variant="primary"
        disabled={!commitMessage.trim() || !stagedCount || isPending}
        onClick={onCommit}
      >
        Commit {stagedCount ? `${stagedCount} staged` : ""}
      </Button>
    </section>
  );
}

function OperationNotice({ operationStatus }: { operationStatus: OperationStatus | null }) {
  if (!operationStatus) {
    return null;
  }

  return (
    <section
      className={`rounded-md border p-2 text-xs leading-5 ${
        operationStatus.kind === "success"
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
          : "border-red-500/20 bg-red-500/10 text-red-100"
      }`}
    >
      <p>{operationStatus.message}</p>
      {operationStatus.output ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-zinc-300">
            Git output
          </summary>
          <pre className="mt-1 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[11px] leading-4 text-zinc-200">
            {operationStatus.output}
          </pre>
        </details>
      ) : null}
    </section>
  );
}

function Notice({
  kind,
  title,
  body,
}: {
  kind: "info" | "error";
  title: string;
  body: string;
}) {
  return (
    <section
      className={`flex gap-2 rounded-md border p-2 text-xs leading-5 ${
        kind === "error"
          ? "border-red-500/20 bg-red-500/10 text-red-100"
          : "border-zinc-800 bg-zinc-950 text-zinc-400"
      }`}
    >
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="block font-medium text-zinc-100">{title}</span>
        <span className="block text-zinc-400">{body}</span>
      </span>
    </section>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-500">
      <div className="mb-2 flex items-center gap-2 text-zinc-200">
        {icon}
        <span className="font-medium">{title}</span>
      </div>
      <p>{body}</p>
    </div>
  );
}

function GitFileSection({
  title,
  files,
  emptyText,
  action,
  children,
}: {
  title: string;
  files: GitChangedFile[];
  emptyText: string;
  action?: ReactNode;
  children: (changedFile: GitChangedFile) => ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex h-7 items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase text-zinc-500">
          {title} {files.length ? `(${files.length})` : ""}
        </h3>
        {action}
      </div>
      {files.length ? (
        <div className="space-y-1">{files.map((changedFile) => children(changedFile))}</div>
      ) : (
        <p className="px-1 py-1 text-xs text-zinc-600">{emptyText}</p>
      )}
    </section>
  );
}

function GitFileRow({
  changedFile,
  onPreviewDiff,
  actions,
}: {
  changedFile: GitChangedFile;
  onPreviewDiff: () => void;
  actions: ReactNode;
}) {
  const pathLabel = changedFile.originalPath
    ? `${changedFile.originalPath} -> ${changedFile.path}`
    : changedFile.path;

  return (
    <div className="group flex min-h-8 items-center gap-2 rounded px-1.5 py-1 hover:bg-zinc-900">
      <ChangeTypeBadge changedFile={changedFile} />
      <div className="min-w-0 flex-1" title={pathLabel}>
        <p className="truncate text-xs text-zinc-200">{pathLabel}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <IconAction
          title="Preview diff"
          icon={<FileText size={12} />}
          onClick={onPreviewDiff}
        />
        {actions}
      </div>
    </div>
  );
}

function ChangeTypeBadge({ changedFile }: { changedFile: GitChangedFile }) {
  const badgeClassName = {
    Added: "border-emerald-500/30 text-emerald-200",
    Copied: "border-sky-500/30 text-sky-200",
    Changed: "border-zinc-500/30 text-zinc-300",
    Conflict: "border-red-500/30 text-red-200",
    Deleted: "border-red-500/30 text-red-200",
    Modified: "border-amber-500/30 text-amber-200",
    Renamed: "border-violet-500/30 text-violet-200",
    Untracked: "border-sky-500/30 text-sky-200",
  }[changedFile.changeType] ?? "border-zinc-500/30 text-zinc-300";

  return (
    <span
      className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded border px-1 text-[10px] font-medium ${badgeClassName}`}
      title={changedFile.changeType}
    >
      {changedFile.changeType.slice(0, 1)}
    </span>
  );
}

function IconAction({
  title,
  icon,
  danger = false,
  disabled,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex h-6 w-6 items-center justify-center rounded transition disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "text-red-300 hover:bg-red-500/15"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      }`}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function SidebarResizeHandle({
  initialWidth,
  onPreview,
  onResize,
}: {
  initialWidth: number;
  onPreview: (width: number | null) => void;
  onResize: (width: number) => void;
}) {
  const animationFrameRef = useRef<number | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = initialWidth;
    event.currentTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth + moveEvent.clientX - startX;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = window.requestAnimationFrame(() => {
        onPreview(nextWidth);
      });
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      onPreview(null);
      onResize(startWidth + upEvent.clientX - startX);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="absolute right-[-3px] top-0 z-40 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-zinc-500"
      onPointerDown={handlePointerDown}
    />
  );
}
