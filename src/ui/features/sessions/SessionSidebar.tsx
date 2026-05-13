import {
  Archive,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Folder,
  FolderOpen,
  MessageSquarePlus,
  Pin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Session } from "../../../domain/models/session";
import {
  codemindQueryKeys,
  useCreateSession,
  useSelectProjectFolder,
} from "../../../application/use-cases/sessionQueries";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { Button } from "../../components/button/Button";
import { cn } from "../../lib/classNames";

interface SessionSidebarProps {
  sessions: Session[];
  selectedSession: Session | null;
}

type SessionFilter = "all" | "archived";
type ProjectFilter = "all" | "project" | "general";
type SessionSort = "recent" | "name" | "project";

export function SessionSidebar({ sessions, selectedSession }: SessionSidebarProps) {
  const createSession = useCreateSession();
  const selectProjectFolder = useSelectProjectFolder(selectedSession?.id ?? null);
  const queryClient = useQueryClient();
  const [closedProjectFolders, setClosedProjectFolders] = useState<Set<string>>(new Set());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [sessionFilter, setSessionFilter] = useState<ProjectFilter>("all");
  const [sessionShowMode, setSessionShowMode] = useState<SessionFilter>("all");
  const [sessionSort, setSessionSort] = useState<SessionSort>("recent");
  const selectedSessionId = useWorkspaceStore((store) => store.selectedSessionId);
  const setSelectedSessionId = useWorkspaceStore((store) => store.setSelectedSessionId);
  const setSelectedFilePath = useWorkspaceStore((store) => store.setSelectedFilePath);

  const visibleSessions = useMemo(() => {
    const sessionsByVisibility =
      sessionShowMode === "archived"
        ? sessions.filter((session) => session.isArchived)
        : sessions;
    const filteredSessions = sessionsByVisibility.filter((session) => {
      if (sessionFilter === "project") {
        return Boolean(session.projectRoot);
      }

      if (sessionFilter === "general") {
        return !session.projectRoot;
      }

      return true;
    });

    return [...filteredSessions].sort((leftSession, rightSession) => {
      if (sessionSort === "name") {
        return leftSession.title.localeCompare(rightSession.title);
      }
      if (sessionSort === "project") {
        return (leftSession.projectRoot ?? "").localeCompare(rightSession.projectRoot ?? "");
      }
      return rightSession.updatedAt.localeCompare(leftSession.updatedAt);
    });
  }, [sessionFilter, sessionShowMode, sessionSort, sessions]);

  const sessionsByProject = useMemo(
    () => groupSessionsByProject(visibleSessions),
    [visibleSessions],
  );
  const fuzzyResults = useMemo(
    () => createSearchResults(sessions, searchText),
    [searchText, sessions],
  );
  const areAllProjectsClosed =
    sessionsByProject.length > 0 &&
    sessionsByProject.every((projectGroup) => closedProjectFolders.has(projectGroup.key));

  async function handleCreateGeneralChat() {
    const session = await createSession.mutateAsync({
      title: "General chat",
      agentId: "codex-cli",
    });
    setSelectedSessionId(session.id);
    setSelectedFilePath(null);
  }

  async function handleCreateProjectChat(projectRoot: string) {
    const session = await createSession.mutateAsync({
      title: "New project chat",
      agentId: "codex-cli",
    });
    await tauriCodemindRepository.setSessionProjectRoot(session.id, projectRoot);
    await queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions });
    setSelectedSessionId(session.id);
    setSelectedFilePath(null);
  }

  async function handleArchiveSession(session: Session) {
    await tauriCodemindRepository.archiveSession(session.id, !session.isArchived);
    await queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions });
  }

  async function handleArchiveProject(projectGroup: ProjectSessionGroup) {
    await Promise.all(
      projectGroup.sessions.map((session) =>
        tauriCodemindRepository.archiveSession(session.id, true),
      ),
    );
    await queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions });
  }

  function handleToggleProjectGroups() {
    if (areAllProjectsClosed) {
      setClosedProjectFolders(new Set());
      return;
    }

    setClosedProjectFolders(new Set(sessionsByProject.map((projectGroup) => projectGroup.key)));
  }

  return (
    <aside className="flex h-full w-[250px] shrink-0 flex-col border-r border-zinc-800 bg-[#181818]">
      <div className="border-b border-zinc-800 p-2">
        <div className="grid grid-cols-3 gap-2">
          <Button
            className="h-9 px-0"
            title="New chat"
            icon={<MessageSquarePlus size={18} />}
            onClick={handleCreateGeneralChat}
          />
          <Button
            className="h-9 px-0"
            title="Open project"
            icon={<FolderOpen size={18} />}
            disabled={!selectedSession}
            onClick={() => selectProjectFolder.mutate()}
          />
          <Button
            className="h-9 px-0"
            title="Search"
            icon={<Search size={18} />}
            onClick={() => setIsSearchOpen(true)}
          />
        </div>
      </div>

      <div className="group relative flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between px-4">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Projects
          </span>
          <div className="relative flex opacity-0 transition group-hover:opacity-100">
            <button
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
              title={areAllProjectsClosed ? "Re-open projects" : "Collapse all projects"}
              onClick={handleToggleProjectGroups}
            >
              {areAllProjectsClosed ? <RotateCcw size={14} /> : <ChevronDown size={14} />}
            </button>
            <button
              className={cn(
                "rounded p-1 text-zinc-400 hover:bg-zinc-800",
                isSortOpen && "bg-zinc-800 text-zinc-100",
              )}
              title="Project settings"
              onClick={() => setIsSortOpen((currentValue) => !currentValue)}
            >
              <SlidersHorizontal size={14} />
            </button>
            <button className="rounded p-1 text-zinc-400 hover:bg-zinc-800" title="Open new project" onClick={() => selectProjectFolder.mutate()}>
              <FolderOpen size={14} />
            </button>
            {isSortOpen ? (
              <ProjectSettingsDropdown
                filter={sessionFilter}
                showMode={sessionShowMode}
                sort={sessionSort}
                onChangeFilter={setSessionFilter}
                onChangeShowMode={setSessionShowMode}
                onChangeSort={setSessionSort}
                onClose={() => setIsSortOpen(false)}
              />
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sessionsByProject.map((projectGroup) => {
            const isClosed = closedProjectFolders.has(projectGroup.key);
            return (
              <div key={projectGroup.key} className="group/project mb-2">
                <div className="flex items-center">
                  <button
                    className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-[10px] font-medium uppercase tracking-wide text-zinc-500 hover:bg-zinc-800"
                    onClick={() =>
                      setClosedProjectFolders((currentFolders) => {
                        const nextFolders = new Set(currentFolders);
                        if (nextFolders.has(projectGroup.key)) {
                          nextFolders.delete(projectGroup.key);
                        } else {
                          nextFolders.add(projectGroup.key);
                        }
                        return nextFolders;
                      })
                    }
                  >
                    <Folder size={13} className="shrink-0 text-amber-300" />
                    <span className="truncate">{projectGroup.name}</span>
                  </button>
                  <div className="ml-1 hidden group-hover/project:flex">
                    {projectGroup.projectRoot ? (
                      <button
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
                        title="Start new chat in project"
                        onClick={() => void handleCreateProjectChat(projectGroup.projectRoot ?? "")}
                      >
                        <MessageSquarePlus size={14} />
                      </button>
                    ) : null}
                    <button className="rounded p-1 text-zinc-400 hover:bg-zinc-800" title="Pin project">
                      <Pin size={14} />
                    </button>
                    <button
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
                      title="Archive all chats"
                      onClick={() => void handleArchiveProject(projectGroup)}
                    >
                      <Archive size={14} />
                    </button>
                    <button className="rounded p-1 text-zinc-400 hover:bg-zinc-800" title="Open in Explorer">
                      <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
                {!isClosed ? (
                  <div>
                    {projectGroup.sessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        isSelected={selectedSessionId === session.id}
                        onSelect={() => {
                          setSelectedSessionId(session.id);
                          setSelectedFilePath(null);
                        }}
                        onArchive={() => void handleArchiveSession(session)}
                        onDelete={async () => {
                          await tauriCodemindRepository.deleteSession(session.id);
                          await queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions });
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {isSearchOpen ? (
        <SearchModal
          searchText={searchText}
          results={fuzzyResults}
          onChangeSearchText={setSearchText}
          onClose={() => setIsSearchOpen(false)}
          onSelectSession={(sessionId) => {
            setSelectedSessionId(sessionId);
            setIsSearchOpen(false);
          }}
        />
      ) : null}
    </aside>
  );
}

function SessionRow({
  session,
  isSelected,
  onSelect,
  onArchive,
  onDelete,
}: {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      className={cn(
        "group/session mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:bg-zinc-800",
        isSelected && "border-zinc-600 bg-zinc-800",
      )}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-100">
        {session.title}
      </span>
      <span className="flex h-5 w-11 shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity group-hover/session:opacity-100">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700"
          onClick={(event) => {
            event.stopPropagation();
            onArchive();
          }}
        >
          <Archive size={12} />
        </span>
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded text-red-300 hover:bg-red-500/15"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={12} />
        </span>
      </span>
    </button>
  );
}

function SearchModal({
  searchText,
  results,
  onChangeSearchText,
  onClose,
  onSelectSession,
}: {
  searchText: string;
  results: SearchResult[];
  onChangeSearchText: (value: string) => void;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={onClose}
    >
      <section
        className="w-[520px] rounded-lg border border-zinc-700 bg-[#1e1e1e] p-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          className="mb-3 h-10 w-full rounded-md border border-zinc-700 bg-[#252525] px-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
          placeholder="Search sessions and projects"
          value={searchText}
          onChange={(event) => onChangeSearchText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="max-h-80 overflow-y-auto">
          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-zinc-800"
              onClick={() => onSelectSession(result.sessionId)}
            >
              <span>
                <span className="block text-sm text-zinc-100">{result.label}</span>
                <span className="text-xs text-zinc-500">{result.type}</span>
              </span>
              <ChevronRight size={14} className="text-zinc-500" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectSettingsDropdown({
  filter,
  showMode,
  sort,
  onChangeFilter,
  onChangeShowMode,
  onChangeSort,
  onClose,
}: {
  filter: ProjectFilter;
  showMode: SessionFilter;
  sort: SessionSort;
  onChangeFilter: (filter: ProjectFilter) => void;
  onChangeShowMode: (showMode: SessionFilter) => void;
  onChangeSort: (sort: SessionSort) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-7 z-40 w-[236px] rounded-md border border-zinc-800 bg-[#202020] p-2 shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="min-w-0">
        <div className="mb-2 text-xs font-medium text-zinc-300">Sort By</div>
        <div className="mb-3 grid gap-1">
          {[
            ["recent", "Recently updated"],
            ["name", "Chat name"],
            ["project", "Project"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "rounded px-2 py-1.5 text-left text-xs",
                sort === value
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
              )}
              onClick={() => onChangeSort(value as SessionSort)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-2 text-xs font-medium text-zinc-300">Filter</div>
        <div className="mb-3 grid grid-cols-3 gap-1">
          {[
            ["all", "All"],
            ["project", "Project"],
            ["general", "General"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "rounded px-2 py-1.5 text-left text-xs",
                filter === value
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
              )}
              onClick={() => onChangeFilter(value as ProjectFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-2 text-xs font-medium text-zinc-300">Show</div>
        <div className="grid grid-cols-2 gap-1">
          {[
            ["all", "Show all"],
            ["archived", "Only archived"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "rounded px-2 py-1.5 text-left text-xs",
                showMode === value
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
              )}
              onClick={() => onChangeShowMode(value as SessionFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

interface ProjectSessionGroup {
  key: string;
  name: string;
  projectRoot: string | null;
  sessions: Session[];
}

interface SearchResult {
  id: string;
  sessionId: string;
  label: string;
  type: "session" | "project";
}

function groupSessionsByProject(sessions: Session[]): ProjectSessionGroup[] {
  const projectGroupByKey = new Map<string, ProjectSessionGroup>();

  for (const session of sessions) {
    const key = session.projectRoot ?? "__general__";
    const existingGroup = projectGroupByKey.get(key);
    if (existingGroup) {
      existingGroup.sessions.push(session);
      continue;
    }

    projectGroupByKey.set(key, {
      key,
      name: session.projectRoot ? getFolderName(session.projectRoot) : "General",
      projectRoot: session.projectRoot,
      sessions: [session],
    });
  }

  return Array.from(projectGroupByKey.values());
}

function createSearchResults(sessions: Session[], searchText: string): SearchResult[] {
  const normalizedSearchText = searchText.trim().toLowerCase();
  const projectResults = new Map<string, SearchResult>();
  const results: SearchResult[] = [];

  for (const session of sessions) {
    const projectName = session.projectRoot ? getFolderName(session.projectRoot) : "General";
    if (!normalizedSearchText || session.title.toLowerCase().includes(normalizedSearchText)) {
      results.push({
        id: session.id,
        sessionId: session.id,
        label: session.title,
        type: "session",
      });
    }
    if (
      session.projectRoot &&
      projectName.toLowerCase().includes(normalizedSearchText) &&
      !projectResults.has(session.projectRoot)
    ) {
      projectResults.set(session.projectRoot, {
        id: session.projectRoot,
        sessionId: session.id,
        label: projectName,
        type: "project",
      });
    }
  }

  return [...projectResults.values(), ...results].slice(0, 24);
}

function getFolderName(projectRoot: string): string {
  const normalizedPath = formatProjectPath(projectRoot).replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);
  return pathParts[pathParts.length - 1] ?? projectRoot;
}

function formatProjectPath(projectRoot: string): string {
  return projectRoot.replace(/^\\\\\?\\/, "").trim();
}
