import { listen } from "@tauri-apps/api/event";
import { Copy, Plus, Square, Terminal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ShellCommandOutput,
  ShellKind,
  ShellOutputEvent,
} from "../../../domain/models/shell";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { Button } from "../../components/button/Button";
import { cn } from "../../lib/classNames";

interface CommandShellProps {
  projectRoot: string | null;
}

interface ShellHistoryEntry extends ShellCommandOutput {
  id: string;
  completedAt: string;
  startedAt: string;
}

interface TerminalTab {
  id: string;
  title: string;
  commandText: string;
  currentDirectory: string;
  previousDirectory: string | null;
  shellKind: ShellKind;
  historyEntries: ShellHistoryEntry[];
  historyIndex: number | null;
  activeRunId: string | null;
}

interface PendingShellOutputPatch {
  stdout: string;
  stderr: string;
  cwd?: string;
  exitCode?: number | null;
  completedAt?: string;
}

const MAX_RETAINED_OUTPUT_CHARACTERS = 240_000;

export function CommandShell({ projectRoot }: CommandShellProps) {
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>(() => [
    createTerminalTab(projectRoot ?? "", 1),
  ]);
  const [activeTabId, setActiveTabId] = useState(() => terminalTabs[0]?.id ?? "");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingShellOutputRef = useRef<Record<string, PendingShellOutputPatch>>({});
  const shellFlushFrameRef = useRef<number | null>(null);
  const toggleShell = useWorkspaceStore((store) => store.toggleShell);
  const shellOptions = useMemo(() => getShellOptions(), []);
  const activeTab = terminalTabs.find((tab) => tab.id === activeTabId) ?? terminalTabs[0];

  useEffect(() => {
    if (!projectRoot) {
      return;
    }

    setTerminalTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.currentDirectory ? tab : { ...tab, currentDirectory: projectRoot },
      ),
    );
  }, [projectRoot]);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeTab?.historyEntries, activeTabId]);

  useEffect(() => {
    const unlistenPromise = listen<ShellOutputEvent>("shell-output", (event) => {
      const shellOutput = event.payload;
      queueShellOutput(shellOutput);

      if (shellOutput.isComplete) {
        setTerminalTabs((currentTabs) =>
          currentTabs.map((tab) =>
            tab.activeRunId === shellOutput.runId
              ? {
                  ...tab,
                  activeRunId: null,
                  currentDirectory: shellOutput.cwd,
                }
              : tab,
          ),
        );
      }
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());

      if (shellFlushFrameRef.current !== null) {
        window.cancelAnimationFrame(shellFlushFrameRef.current);
        shellFlushFrameRef.current = null;
      }

      flushShellOutput();
    };
  }, []);

  function queueShellOutput(shellOutput: ShellOutputEvent) {
    const currentPatch = pendingShellOutputRef.current[shellOutput.runId] ?? {
      stdout: "",
      stderr: "",
    };

    pendingShellOutputRef.current[shellOutput.runId] = {
      ...currentPatch,
      stdout:
        shellOutput.stream === "stdout"
          ? `${currentPatch.stdout}${shellOutput.chunk}`
          : currentPatch.stdout,
      stderr:
        shellOutput.stream === "stderr"
          ? `${currentPatch.stderr}${shellOutput.chunk}`
          : currentPatch.stderr,
      cwd: shellOutput.cwd,
      exitCode: shellOutput.isComplete ? shellOutput.exitCode : currentPatch.exitCode,
      completedAt: shellOutput.isComplete ? new Date().toISOString() : currentPatch.completedAt,
    };

    if (shellFlushFrameRef.current === null) {
      shellFlushFrameRef.current = window.requestAnimationFrame(flushShellOutput);
    }
  }

  function flushShellOutput() {
    const pendingPatches = pendingShellOutputRef.current;
    pendingShellOutputRef.current = {};
    shellFlushFrameRef.current = null;

    if (Object.keys(pendingPatches).length === 0) {
      return;
    }

    setTerminalTabs((currentTabs) =>
      currentTabs.map((tab) => ({
        ...tab,
        historyEntries: tab.historyEntries.map((entry) => {
          const patch = pendingPatches[entry.id];

          if (!patch) {
            return entry;
          }

          return {
            ...entry,
            cwd: patch.cwd ?? entry.cwd,
            exitCode: patch.exitCode ?? entry.exitCode,
            stdout: appendWithLimit(entry.stdout, patch.stdout),
            stderr: appendWithLimit(entry.stderr, patch.stderr),
            completedAt: patch.completedAt ?? entry.completedAt,
          };
        }),
      })),
    );
  }

  function updateActiveTab(tabPatch: Partial<TerminalTab>) {
    setTerminalTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === activeTabId ? { ...tab, ...tabPatch } : tab)),
    );
  }

  function updateActiveTabWith(updater: (tab: TerminalTab) => TerminalTab) {
    setTerminalTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === activeTabId ? updater(tab) : tab)),
    );
  }

  async function handleRunCommand() {
    if (!activeTab) {
      return;
    }

    const command = activeTab.commandText.trim();
    if (!command || activeTab.activeRunId) {
      return;
    }

    if (command === "clear" || command === "cls") {
      updateActiveTab({ historyEntries: [], commandText: "" });
      return;
    }

    if (isChangeDirectoryCommand(command)) {
      await changeActiveTabDirectory(command);
      return;
    }

    const startedAt = new Date().toISOString();
    const runId = crypto.randomUUID();
    const cwd = activeTab.currentDirectory || projectRoot || "";
    updateActiveTabWith((tab) => ({
      ...tab,
      activeRunId: runId,
      commandText: "",
      historyIndex: null,
      historyEntries: [
        ...tab.historyEntries,
        {
          id: runId,
          command,
          cwd,
          exitCode: null,
          stdout: "",
          stderr: "",
          startedAt,
          completedAt: startedAt,
        },
      ],
    }));

    try {
      await tauriCodemindRepository.startShellCommand(
        cwd,
        command,
        activeTab.shellKind,
        runId,
      );
    } catch (error) {
      updateHistoryEntry(runId, {
        exitCode: 1,
        stderr: error instanceof Error ? error.message : String(error),
      });
      updateActiveTab({ activeRunId: null });
    }
  }

  async function changeActiveTabDirectory(command: string) {
    if (!activeTab) {
      return;
    }

    const startedAt = new Date().toISOString();
    const requestedDirectory = getRequestedDirectory(command, activeTab.previousDirectory);
    const cwd = activeTab.currentDirectory || projectRoot || "";
    const entryId = crypto.randomUUID();

    if (requestedDirectory === null) {
      appendActiveHistoryEntry({
        command,
        cwd,
        exitCode: 1,
        stdout: "",
        stderr: "No previous directory.",
        startedAt,
      });
      updateActiveTab({ commandText: "" });
      return;
    }

    updateActiveTabWith((tab) => ({
      ...tab,
      commandText: "",
      historyEntries: [
        ...tab.historyEntries,
        {
          id: entryId,
          command,
          cwd,
          exitCode: null,
          stdout: "",
          stderr: "",
          startedAt,
          completedAt: startedAt,
        },
      ],
    }));

    try {
      const resolvedDirectory = await tauriCodemindRepository.resolveShellDirectory(
        cwd,
        requestedDirectory,
      );
      updateActiveTabWith((tab) => ({
        ...tab,
        previousDirectory: cwd || null,
        currentDirectory: resolvedDirectory.cwd,
      }));
      updateHistoryEntry(entryId, {
        cwd: resolvedDirectory.cwd,
        exitCode: 0,
        stdout: resolvedDirectory.cwd,
        stderr: "",
      });
    } catch (error) {
      updateHistoryEntry(entryId, {
        exitCode: 1,
        stderr: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function appendActiveHistoryEntry(entry: Omit<ShellHistoryEntry, "id" | "completedAt">) {
    updateActiveTabWith((tab) => ({
      ...tab,
      historyEntries: [
        ...tab.historyEntries,
        {
          ...entry,
          id: crypto.randomUUID(),
          completedAt: new Date().toISOString(),
        },
      ],
    }));
  }

  function updateHistoryEntry(entryId: string, entryPatch: Partial<ShellHistoryEntry>) {
    setTerminalTabs((currentTabs) =>
      currentTabs.map((tab) => ({
        ...tab,
        historyEntries: tab.historyEntries.map((entry) =>
          entry.id === entryId
            ? { ...entry, ...entryPatch, completedAt: new Date().toISOString() }
            : entry,
        ),
      })),
    );
  }

  async function handleStopCommand() {
    if (!activeTab?.activeRunId) {
      return;
    }
    await tauriCodemindRepository.stopShellCommand(activeTab.activeRunId);
  }

  async function copyEntryOutput(entry: ShellHistoryEntry) {
    const outputText = [entry.stdout, entry.stderr].filter(Boolean).join("\n");
    if (outputText) {
      await navigator.clipboard.writeText(outputText);
    }
  }

  function handleHistoryNavigation(direction: -1 | 1) {
    if (!activeTab) {
      return;
    }

    const commands = activeTab.historyEntries.map((entry) => entry.command).filter(Boolean);
    if (commands.length === 0) {
      return;
    }
    const nextIndex =
      activeTab.historyIndex === null
        ? commands.length - 1
        : Math.min(Math.max(activeTab.historyIndex + direction, 0), commands.length - 1);
    updateActiveTab({
      historyIndex: nextIndex,
      commandText: commands[nextIndex] ?? "",
    });
  }

  function createNewTerminalTab() {
    const nextTab = createTerminalTab(projectRoot ?? "", terminalTabs.length + 1);
    setTerminalTabs((currentTabs) => [...currentTabs, nextTab]);
    setActiveTabId(nextTab.id);
  }

  function closeTerminalTab(tabId: string) {
    let nextActiveTabId: string | null = null;
    setTerminalTabs((currentTabs) => {
      if (currentTabs.length === 1) {
        return currentTabs.map((tab) =>
          tab.id === tabId ? { ...createTerminalTab(projectRoot ?? "", 1), id: tab.id } : tab,
        );
      }

      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        nextActiveTabId = nextTabs[nextTabs.length - 1]?.id ?? "";
      }
      return nextTabs;
    });
    if (nextActiveTabId !== null) {
      setActiveTabId(nextActiveTabId);
    }
  }

  if (!activeTab) {
    return null;
  }

  return (
    <section className="flex h-full flex-col border-t border-zinc-800 bg-[#1f1f1f]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Terminal size={15} className="mx-1 shrink-0 text-zinc-400" />
          {terminalTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "group flex h-8 max-w-44 items-center gap-2 rounded-t-md border border-b-0 px-2 text-xs",
                tab.id === activeTabId
                  ? "border-zinc-700 bg-[#242424] text-zinc-100"
                  : "border-transparent text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200",
              )}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="truncate">{tab.title}</span>
              {tab.activeRunId ? (
                <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              ) : null}
              <span
                role="button"
                tabIndex={0}
                className="rounded p-0.5 opacity-60 hover:bg-zinc-700 hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTerminalTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    closeTerminalTab(tab.id);
                  }
                }}
              >
                <X size={11} />
              </span>
            </button>
          ))}
          <Button
            className="h-7 w-7 shrink-0 px-0"
            variant="ghost"
            title="New terminal"
            icon={<Plus size={14} />}
            onClick={createNewTerminalTab}
          />
          <select
            className="ml-2 rounded border border-zinc-700 bg-[#242424] px-2 py-1 text-xs text-zinc-200 outline-none"
            value={activeTab.shellKind}
            onChange={(event) =>
              updateActiveTab({ shellKind: event.target.value as ShellKind })
            }
          >
            {shellOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="min-w-0 truncate px-2 text-xs text-zinc-500">
            {formatDirectory(activeTab.currentDirectory || projectRoot || "Workspace")}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            className="h-7 w-7 px-0"
            variant="ghost"
            title="Clear terminal"
            icon={<Trash2 size={14} />}
            onClick={() => updateActiveTab({ historyEntries: [] })}
          />
          {activeTab.activeRunId ? (
            <Button
              className="h-7 w-7 px-0"
              variant="danger"
              title="Stop command"
              icon={<Square size={13} />}
              onClick={() => void handleStopCommand()}
            />
          ) : null}
          <Button
            className="h-7 w-7 px-0"
            variant="ghost"
            title="Close shell"
            icon={<X size={14} />}
            onClick={toggleShell}
          />
        </div>
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs">
        {activeTab.historyEntries.map((entry) => (
          <div key={entry.id} className="mb-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-zinc-400">
              <span className="text-zinc-500">{formatDirectory(entry.cwd)}</span>
              <span className="min-w-0 flex-1 text-zinc-300"> &gt; {entry.command}</span>
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px]",
                  entry.exitCode === 0 && "border-emerald-500/30 text-emerald-200",
                  entry.exitCode === null && "border-sky-500/30 text-sky-200",
                  entry.exitCode !== null &&
                    entry.exitCode !== 0 &&
                    "border-red-500/30 text-red-200",
                )}
              >
                {entry.exitCode === null ? "running" : `exit ${entry.exitCode}`}
              </span>
              <span className="text-[10px] text-zinc-600">
                {formatShellTimestamp(entry.completedAt)}
              </span>
              {entry.stdout || entry.stderr ? (
                <button
                  type="button"
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  title="Copy output"
                  aria-label="Copy command output"
                  onClick={() => void copyEntryOutput(entry)}
                >
                  <Copy size={12} />
                </button>
              ) : null}
            </div>
            {entry.stdout ? (
              <pre className="select-text whitespace-pre-wrap text-zinc-300">{entry.stdout}</pre>
            ) : null}
            {entry.stderr ? (
              <pre className="select-text whitespace-pre-wrap text-red-200">{entry.stderr}</pre>
            ) : null}
          </div>
        ))}
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="shrink-0 text-zinc-500">
            {formatDirectory(activeTab.currentDirectory || projectRoot || "")}
          </span>
          <span>&gt;</span>
          <input
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-100 outline-none"
            autoFocus
            value={activeTab.commandText}
            onChange={(event) => updateActiveTab({ commandText: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleRunCommand();
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                handleHistoryNavigation(-1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                handleHistoryNavigation(1);
              }
            }}
          />
        </div>
      </div>
    </section>
  );
}

function createTerminalTab(projectRoot: string, tabNumber: number): TerminalTab {
  return {
    id: crypto.randomUUID(),
    title: `Terminal ${tabNumber}`,
    commandText: "",
    currentDirectory: projectRoot,
    previousDirectory: null,
    shellKind: getDefaultShellKind(),
    historyEntries: [],
    historyIndex: null,
    activeRunId: null,
  };
}

function appendWithLimit(currentValue: string, nextChunk: string) {
  const combinedValue = `${currentValue}${nextChunk}`;

  if (combinedValue.length <= MAX_RETAINED_OUTPUT_CHARACTERS) {
    return combinedValue;
  }

  return [
    "\n[Codemind truncated older terminal output]\n\n",
    combinedValue.slice(-MAX_RETAINED_OUTPUT_CHARACTERS),
  ].join("");
}

function getDefaultShellKind(): ShellKind {
  return isWindowsUserAgent() ? "powerShell" : "sh";
}

function getShellOptions(): Array<{ value: ShellKind; label: string }> {
  return isWindowsUserAgent()
    ? [
        { value: "powerShell", label: "PowerShell" },
        { value: "commandPrompt", label: "Command Prompt" },
        { value: "gitBash", label: "Git Bash" },
      ]
    : [
        { value: "sh", label: "sh" },
        { value: "bash", label: "bash" },
        { value: "zsh", label: "zsh" },
      ];
}

function isWindowsUserAgent(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.userAgent.toLowerCase().includes("windows");
}

function isChangeDirectoryCommand(command: string): boolean {
  return /^cd(?:\s+|$)/i.test(command);
}

function getRequestedDirectory(command: string, previousDirectory: string | null): string | null {
  const requestedDirectory = command.replace(/^cd(?:\s+)?/i, "").trim();
  if (requestedDirectory === "-") {
    return previousDirectory;
  }
  return requestedDirectory;
}

function formatShellTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatDirectory(directory: string): string {
  return directory.replace(/^\\\\\?\\/, "").trim();
}
