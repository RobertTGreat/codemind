import {
  Code2,
  Files,
  FolderKanban,
  GitBranch,
  MessageSquare,
  Package,
  PanelBottom,
  Search,
  Settings,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ReactNode,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { DiffProposal } from "../../domain/models/approval";
import {
  useCreateSession,
  usePendingDiffs,
  useSessions,
} from "../../application/use-cases/sessionQueries";
import { createFileChangeSummaryByPath } from "../../domain/logic/diffAnnotations";
import { useWorkspaceStore, type WorkspacePaneId } from "../../stores/workspaceStore";
import { ChatPanel } from "../features/chat/ChatPanel";
import { OpenVsxSidebar } from "../features/compatibility/OpenVsxSidebar";
import { CodeViewer } from "../features/editor/CodeViewer";
import { FileExplorer } from "../features/explorer/FileExplorer";
import { GitSidebar } from "../features/git/GitSidebar";
import { QuickOpenDialog } from "../features/search/QuickOpenDialog";
import { CommandShell } from "../features/shell/CommandShell";
import { SessionSidebar } from "../features/sessions/SessionSidebar";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { cn } from "../lib/classNames";

export function CodemindWorkspace() {
  const sessions = useSessions();
  const createSession = useCreateSession();
  const [selectedDiff, setSelectedDiff] = useState<DiffProposal | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const selectedSessionId = useWorkspaceStore((store) => store.selectedSessionId);
  const setSelectedSessionId = useWorkspaceStore((store) => store.setSelectedSessionId);
  const selectedFilePath = useWorkspaceStore((store) => store.selectedFilePath);
  const setSelectedFilePath = useWorkspaceStore((store) => store.setSelectedFilePath);
  const visibleSections = useWorkspaceStore((store) => store.visibleSections);
  const toggleSection = useWorkspaceStore((store) => store.toggleSection);
  const paneOrder = useWorkspaceStore((store) => store.paneOrder);
  const paneSizes = useWorkspaceStore((store) => store.paneSizes);
  const setPaneSize = useWorkspaceStore((store) => store.setPaneSize);
  const isShellOpen = useWorkspaceStore((store) => store.isShellOpen);
  const toggleShell = useWorkspaceStore((store) => store.toggleShell);
  const shellHeight = useWorkspaceStore((store) => store.shellHeight);
  const setShellHeight = useWorkspaceStore((store) => store.setShellHeight);
  const openVsxWidth = useWorkspaceStore((store) => store.openVsxWidth);
  const setOpenVsxWidth = useWorkspaceStore((store) => store.setOpenVsxWidth);
  const gitWidth = useWorkspaceStore((store) => store.gitWidth);
  const setGitWidth = useWorkspaceStore((store) => store.setGitWidth);
  const uiScalePercent = useWorkspaceStore((store) => store.uiScalePercent);
  const [previewShellHeight, setPreviewShellHeight] = useState<number | null>(null);

  const activeSessions = useMemo(
    () => sessions.data?.filter((session) => !session.isArchived) ?? [],
    [sessions.data],
  );
  const selectedSession = useMemo(
    () =>
      activeSessions.find((session) => session.id === selectedSessionId) ??
      activeSessions[0] ??
      null,
    [activeSessions, selectedSessionId],
  );
  const pendingDiffs = usePendingDiffs(selectedSession?.id ?? null);
  const fileChangeSummaryByPath = useMemo(
    () => createFileChangeSummaryByPath(pendingDiffs.data ?? []),
    [pendingDiffs.data],
  );

  useEffect(() => {
    if (!selectedSessionId && selectedSession) {
      setSelectedSessionId(selectedSession.id);
    }
  }, [selectedSession, selectedSessionId, setSelectedSessionId]);

  useEffect(() => {
    if (!sessions.isLoading && activeSessions.length === 0 && !createSession.isPending) {
      createSession
        .mutateAsync({ title: "New coding session", agentId: "codex-cli" })
        .then((session) => setSelectedSessionId(session.id))
        .catch(() => undefined);
    }
  }, [activeSessions.length, createSession, sessions.isLoading, setSelectedSessionId]);

  useEffect(() => {
    function handleWorkspaceShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((isOpen) => !isOpen);
      }

      if ((event.ctrlKey || event.metaKey) && key === "p") {
        event.preventDefault();
        setIsQuickOpenOpen((isOpen) => !isOpen);
      }

      if (event.key === "Escape") {
        setIsCommandPaletteOpen(false);
        setIsQuickOpenOpen(false);
      }
    }

    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, []);

  const visiblePaneIds: WorkspacePaneId[] = paneOrder.filter((paneId) => {
    return visibleSections[paneId];
  });

  const workspaceScaleStyle: CSSProperties & { "--codemind-ui-scale": string } = {
    "--codemind-ui-scale": `${uiScalePercent / 100}`,
    fontSize: `calc(14px * var(--codemind-ui-scale))`,
  };

  function handleSelectFile(relativePath: string) {
    setSelectedDiff(null);
    setSelectedFilePath(relativePath);
  }

  return (
    <main
      className="relative flex h-full w-full bg-[#121212] text-zinc-100"
      style={workspaceScaleStyle}
    >
      <ActivityRail onOpenSettings={() => setIsSettingsOpen(true)} />
      {visibleSections.sessions ? (
        <SessionSidebar sessions={activeSessions} selectedSession={selectedSession} />
      ) : null}
      {visibleSections.openVsx ? (
        <OpenVsxSidebar
          projectRoot={selectedSession?.projectRoot ?? null}
          width={openVsxWidth}
          onResize={setOpenVsxWidth}
        />
      ) : null}
      {visibleSections.git ? (
        <GitSidebar
          projectRoot={selectedSession?.projectRoot ?? null}
          width={gitWidth}
          onResize={setGitWidth}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {visiblePaneIds.map((paneId, paneIndex) => (
              <PaneSlot
                key={paneId}
                paneId={paneId}
                width={paneSizes[paneId]}
                isLastPane={paneIndex === visiblePaneIds.length - 1}
                onResize={(nextWidth) => setPaneSize(paneId, nextWidth)}
              >
                {paneId === "explorer" ? (
                  <FileExplorer
                    projectRoot={selectedSession?.projectRoot ?? null}
                    fileChangeSummaryByPath={fileChangeSummaryByPath}
                    onSelectFile={handleSelectFile}
                  />
                ) : null}
                {paneId === "editor" ? (
                  <CodeViewer
                    projectRoot={selectedSession?.projectRoot ?? null}
                    selectedFilePath={selectedFilePath}
                    selectedDiff={selectedDiff}
                    fileChangeSummaryByPath={fileChangeSummaryByPath}
                    onSelectFile={handleSelectFile}
                    onClearSelectedDiff={() => setSelectedDiff(null)}
                  />
                ) : null}
                {paneId === "chat" ? (
                  <ChatPanel
                    session={selectedSession}
                    selectedDiffId={selectedDiff?.id ?? null}
                    onSelectDiff={setSelectedDiff}
                  />
                ) : null}
              </PaneSlot>
            ))}
          </div>
          {isShellOpen ? (
            <div
              className="relative shrink-0"
              style={{ height: previewShellHeight ?? shellHeight }}
            >
              <ShellResizeHandle
                initialHeight={shellHeight}
                onPreview={setPreviewShellHeight}
                onResize={(nextHeight) => {
                  setPreviewShellHeight(null);
                  setShellHeight(nextHeight);
                }}
              />
              <CommandShell projectRoot={selectedSession?.projectRoot ?? null} />
            </div>
          ) : null}
        </div>
      </div>
      <SettingsDialog
        isOpen={isSettingsOpen}
        selectedProjectRoot={selectedSession?.projectRoot ?? null}
        onClose={() => setIsSettingsOpen(false)}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        actions={[
          {
            id: "settings",
            title: "Open Settings",
            detail: "Rules, terminal, UI scale, and project configuration",
            onRun: () => setIsSettingsOpen(true),
          },
          {
            id: "sessions",
            title: "Toggle Sessions",
            detail: visibleSections.sessions ? "Hide session list" : "Show session list",
            onRun: () => toggleSection("sessions"),
          },
          {
            id: "files",
            title: "Toggle Files",
            detail: visibleSections.explorer ? "Hide file explorer" : "Show file explorer",
            onRun: () => toggleSection("explorer"),
          },
          {
            id: "git",
            title: "Toggle Git",
            detail: visibleSections.git ? "Hide source control" : "Show source control",
            onRun: () => toggleSection("git"),
          },
          {
            id: "open-vsx",
            title: "Toggle Open VSX",
            detail: visibleSections.openVsx ? "Hide extension search" : "Show extension search",
            onRun: () => toggleSection("openVsx"),
          },
          {
            id: "terminal",
            title: "Toggle Terminal",
            detail: isShellOpen ? "Hide terminal" : "Show terminal",
            onRun: toggleShell,
          },
        ]}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
      <QuickOpenDialog
        isOpen={isQuickOpenOpen}
        projectRoot={selectedSession?.projectRoot ?? null}
        onSelectFile={(relativePath) => {
          handleSelectFile(relativePath);
          setIsQuickOpenOpen(false);
        }}
        onClose={() => setIsQuickOpenOpen(false)}
      />
    </main>
  );
}

interface CommandPaletteAction {
  id: string;
  title: string;
  detail: string;
  onRun: () => void;
}

function CommandPalette({
  isOpen,
  actions,
  onClose,
}: {
  isOpen: boolean;
  actions: CommandPaletteAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return actions;
    }

    return actions
      .map((action) => ({
        action,
        score: scoreCommandPaletteAction(action, normalizedQuery),
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((result) => result.action);
  }, [actions, query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) {
    return null;
  }

  const activeAction = filteredActions[activeIndex];

  function runAction(action: CommandPaletteAction) {
    action.onRun();
    onClose();
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/45 px-4 pt-16 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-zinc-700 bg-[#1f1f1f] shadow-2xl"
      >
        <label className="flex h-11 items-center gap-2 border-b border-zinc-800 px-3 text-sm text-zinc-500">
          <Search size={15} />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
            placeholder="Search commands..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(index + 1, Math.max(filteredActions.length - 1, 0)),
                );
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }

              if (event.key === "Enter" && activeAction) {
                runAction(activeAction);
              }

              if (event.key === "Escape") {
                onClose();
              }
            }}
          />
          <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
            Esc
          </span>
        </label>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filteredActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              className={cn(
                "block w-full rounded-md px-2.5 py-2 text-left",
                index === activeIndex ? "bg-zinc-800" : "hover:bg-zinc-800",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => runAction(action)}
            >
              <span className="block text-sm font-medium text-zinc-100">{action.title}</span>
              <span className="mt-0.5 block text-xs text-zinc-500">{action.detail}</span>
            </button>
          ))}
          {filteredActions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              No matching commands.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function scoreCommandPaletteAction(
  action: CommandPaletteAction,
  normalizedQuery: string,
): number {
  const haystack = `${action.title} ${action.detail}`.toLowerCase();

  if (haystack.includes(normalizedQuery)) {
    return 1_000 - haystack.indexOf(normalizedQuery);
  }

  let score = 0;
  let queryIndex = 0;

  for (const character of haystack) {
    if (character === normalizedQuery[queryIndex]) {
      score += 8;
      queryIndex += 1;

      if (queryIndex === normalizedQuery.length) {
        return score;
      }
    }
  }

  return 0;
}

function ActivityRail({ onOpenSettings }: { onOpenSettings: () => void }) {
  const isShellOpen = useWorkspaceStore((store) => store.isShellOpen);
  const toggleShell = useWorkspaceStore((store) => store.toggleShell);
  const visibleSections = useWorkspaceStore((store) => store.visibleSections);
  const toggleSection = useWorkspaceStore((store) => store.toggleSection);

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r border-zinc-800 bg-[#181818] py-4">
      <nav className="flex flex-1 flex-col gap-3">
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.sessions ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Sessions"
          aria-label="Toggle sessions"
          aria-pressed={visibleSections.sessions}
          onClick={() => toggleSection("sessions")}
        >
          <FolderKanban size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.explorer ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Files"
          aria-label="Toggle files"
          aria-pressed={visibleSections.explorer}
          onClick={() => toggleSection("explorer")}
        >
          <Files size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.editor ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Code"
          aria-label="Toggle code editor"
          aria-pressed={visibleSections.editor}
          onClick={() => toggleSection("editor")}
        >
          <Code2 size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.chat ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Chat"
          aria-label="Toggle chat"
          aria-pressed={visibleSections.chat}
          onClick={() => toggleSection("chat")}
        >
          <MessageSquare size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.openVsx ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Open VSX"
          aria-label="Toggle Open VSX"
          aria-pressed={visibleSections.openVsx}
          onClick={() => toggleSection("openVsx")}
        >
          <Package size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.git ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Git"
          aria-label="Toggle Git"
          aria-pressed={visibleSections.git}
          onClick={() => toggleSection("git")}
        >
          <GitBranch size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${isShellOpen ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Terminal"
          aria-label="Toggle terminal"
          aria-pressed={isShellOpen}
          onClick={toggleShell}
        >
          <PanelBottom size={18} />
        </button>
      </nav>
      <button
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
        title="Settings"
        aria-label="Open settings"
        onClick={onOpenSettings}
      >
        <Settings size={17} />
      </button>
    </aside>
  );
}

interface PaneSlotProps {
  paneId: WorkspacePaneId;
  width: number;
  isLastPane: boolean;
  children: ReactNode;
  onResize: (width: number) => void;
}

const minimumPaneWidthById: Record<WorkspacePaneId, string> = {
  explorer: "max(200px, 11vw)",
  editor: "max(360px, 22vw)",
  chat: "max(380px, 22vw)",
};

function PaneSlot({ paneId, width, isLastPane, children, onResize }: PaneSlotProps) {
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const displayedWidth = previewWidth ?? width;

  return (
    <section
      className="relative flex flex-col border-r border-zinc-800 last:border-r-0"
      style={{
        flexBasis: isLastPane ? 0 : displayedWidth,
        flexGrow: isLastPane ? 1 : 0,
        flexShrink: 1,
        minWidth: minimumPaneWidthById[paneId],
        width: isLastPane ? undefined : displayedWidth,
      }}
    >
      <div className="min-h-0 flex-1">{children}</div>
      {!isLastPane ? (
        <PaneResizeHandle
          initialWidth={displayedWidth}
          onPreview={setPreviewWidth}
          onResize={(nextWidth) => {
            setPreviewWidth(null);
            onResize(nextWidth);
          }}
        />
      ) : null}
    </section>
  );
}

interface PaneResizeHandleProps {
  initialWidth: number;
  onPreview: (width: number) => void;
  onResize: (width: number) => void;
}

function PaneResizeHandle({ initialWidth, onPreview, onResize }: PaneResizeHandleProps) {
  const animationFrameRef = useRef<number | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = initialWidth;
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
      onResize(startWidth + upEvent.clientX - startX);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      className="absolute right-[-3px] top-0 z-20 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-zinc-500"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
    />
  );
}

interface ShellResizeHandleProps {
  initialHeight: number;
  onPreview: (height: number) => void;
  onResize: (height: number) => void;
}

function ShellResizeHandle({ initialHeight, onPreview, onResize }: ShellResizeHandleProps) {
  const animationFrameRef = useRef<number | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = initialHeight;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = startHeight - (moveEvent.clientY - startY);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = window.requestAnimationFrame(() => {
        onPreview(nextHeight);
      });
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      onResize(startHeight - (upEvent.clientY - startY));
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      className="absolute left-0 top-[-3px] z-20 h-1.5 w-full cursor-row-resize bg-transparent hover:bg-zinc-500"
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={handlePointerDown}
    />
  );
}
