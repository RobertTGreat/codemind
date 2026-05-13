import {
  Code2,
  Files,
  FolderKanban,
  GitBranch,
  MessageSquare,
  Package,
  PanelBottom,
  Settings,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { CommandShell } from "../features/shell/CommandShell";
import { SessionSidebar } from "../features/sessions/SessionSidebar";
import { SettingsDialog } from "../features/settings/SettingsDialog";

export function CodemindWorkspace() {
  const sessions = useSessions();
  const createSession = useCreateSession();
  const [selectedDiff, setSelectedDiff] = useState<DiffProposal | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const selectedSessionId = useWorkspaceStore((store) => store.selectedSessionId);
  const setSelectedSessionId = useWorkspaceStore((store) => store.setSelectedSessionId);
  const selectedFilePath = useWorkspaceStore((store) => store.selectedFilePath);
  const visibleSections = useWorkspaceStore((store) => store.visibleSections);
  const paneSizes = useWorkspaceStore((store) => store.paneSizes);
  const setPaneSize = useWorkspaceStore((store) => store.setPaneSize);
  const isShellOpen = useWorkspaceStore((store) => store.isShellOpen);
  const shellHeight = useWorkspaceStore((store) => store.shellHeight);
  const setShellHeight = useWorkspaceStore((store) => store.setShellHeight);
  const openVsxWidth = useWorkspaceStore((store) => store.openVsxWidth);
  const setOpenVsxWidth = useWorkspaceStore((store) => store.setOpenVsxWidth);
  const gitWidth = useWorkspaceStore((store) => store.gitWidth);
  const setGitWidth = useWorkspaceStore((store) => store.setGitWidth);
  const uiScalePercent = useWorkspaceStore((store) => store.uiScalePercent);

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

  const visiblePaneIds: WorkspacePaneId[] = (["explorer", "editor", "chat"] as WorkspacePaneId[]).filter((paneId) => {
    return visibleSections[paneId];
  });

  const workspaceScaleStyle: CSSProperties & { zoom: string } = {
    zoom: `${uiScalePercent}%`,
  };

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
                  />
                ) : null}
                {paneId === "editor" ? (
                  <CodeViewer
                    projectRoot={selectedSession?.projectRoot ?? null}
                    selectedFilePath={selectedFilePath}
                    selectedDiff={selectedDiff}
                    fileChangeSummaryByPath={fileChangeSummaryByPath}
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
              style={{ height: shellHeight }}
            >
              <ShellResizeHandle
                initialHeight={shellHeight}
                onResize={setShellHeight}
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
    </main>
  );
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
          onClick={() => toggleSection("sessions")}
        >
          <FolderKanban size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.explorer ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Files"
          onClick={() => toggleSection("explorer")}
        >
          <Files size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.editor ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Code"
          onClick={() => toggleSection("editor")}
        >
          <Code2 size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.chat ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Chat"
          onClick={() => toggleSection("chat")}
        >
          <MessageSquare size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.openVsx ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Open VSX"
          onClick={() => toggleSection("openVsx")}
        >
          <Package size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${visibleSections.git ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Git"
          onClick={() => toggleSection("git")}
        >
          <GitBranch size={18} />
        </button>
        <button
          className={`flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-800 ${isShellOpen ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"}`}
          title="Terminal"
          onClick={toggleShell}
        >
          <PanelBottom size={18} />
        </button>
      </nav>
      <button
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
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
  return (
    <section
      className="relative flex flex-col border-r border-zinc-800 last:border-r-0"
      style={{
        flexBasis: isLastPane ? 0 : width,
        flexGrow: isLastPane ? 1 : 0,
        flexShrink: 1,
        minWidth: minimumPaneWidthById[paneId],
        width: isLastPane ? undefined : width,
      }}
    >
      <div className="min-h-0 flex-1">{children}</div>
      {!isLastPane ? (
        <PaneResizeHandle initialWidth={width} onResize={onResize} />
      ) : null}
    </section>
  );
}

interface PaneResizeHandleProps {
  initialWidth: number;
  onResize: (width: number) => void;
}

function PaneResizeHandle({ initialWidth, onResize }: PaneResizeHandleProps) {
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = initialWidth;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      onResize(startWidth + moveEvent.clientX - startX);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      className="absolute right-[-3px] top-0 z-20 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-zinc-500"
      onPointerDown={handlePointerDown}
    />
  );
}

interface ShellResizeHandleProps {
  initialHeight: number;
  onResize: (height: number) => void;
}

function ShellResizeHandle({ initialHeight, onResize }: ShellResizeHandleProps) {
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const startY = event.clientY;
    const startHeight = initialHeight;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      onResize(startHeight - (moveEvent.clientY - startY));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      className="absolute left-0 top-[-3px] z-20 h-1.5 w-full cursor-row-resize bg-transparent hover:bg-zinc-500"
      onPointerDown={handlePointerDown}
    />
  );
}
