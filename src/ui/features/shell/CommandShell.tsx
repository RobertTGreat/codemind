import { listen } from "@tauri-apps/api/event";
import { Copy, Square, Terminal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ShellCommandOutput,
  ShellKind,
  ShellOutputEvent,
} from "../../../domain/models/shell";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { Button } from "../../components/button/Button";

interface CommandShellProps {
  projectRoot: string | null;
}

interface ShellHistoryEntry extends ShellCommandOutput {
  id: string;
  completedAt: string;
  startedAt: string;
}

export function CommandShell({ projectRoot }: CommandShellProps) {
  const [commandText, setCommandText] = useState("");
  const [historyEntries, setHistoryEntries] = useState<ShellHistoryEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [shellKind, setShellKind] = useState<ShellKind>("powerShell");
  const [currentDirectory, setCurrentDirectory] = useState(projectRoot ?? "");
  const [previousDirectory, setPreviousDirectory] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const toggleShell = useWorkspaceStore((store) => store.toggleShell);

  useEffect(() => {
    setCurrentDirectory(projectRoot ?? "");
  }, [projectRoot]);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [historyEntries]);

  useEffect(() => {
    const unlistenPromise = listen<ShellOutputEvent>("shell-output", (event) => {
      const shellOutput = event.payload;
      setHistoryEntries((currentEntries) =>
        currentEntries.map((entry) => {
          if (entry.id !== shellOutput.runId) {
            return entry;
          }

          return {
            ...entry,
            cwd: shellOutput.cwd,
            exitCode: shellOutput.isComplete ? shellOutput.exitCode : entry.exitCode,
            stdout:
              shellOutput.stream === "stdout"
                ? `${entry.stdout}${shellOutput.chunk}`
                : entry.stdout,
            stderr:
              shellOutput.stream === "stderr"
                ? `${entry.stderr}${shellOutput.chunk}`
                : entry.stderr,
            completedAt: shellOutput.isComplete
              ? new Date().toISOString()
              : entry.completedAt,
          };
        }),
      );

      if (shellOutput.isComplete) {
        setActiveRunId((currentRunId) =>
          currentRunId === shellOutput.runId ? null : currentRunId,
        );
        setIsRunning(false);
        setCurrentDirectory(shellOutput.cwd);
      }
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  async function handleRunCommand() {
    const command = commandText.trim();
    if (!command || isRunning) {
      return;
    }

    if (command === "clear" || command === "cls") {
      setHistoryEntries([]);
      setCommandText("");
      return;
    }

    if (isChangeDirectoryCommand(command)) {
      const startedAt = new Date().toISOString();
      const requestedDirectory = getRequestedDirectory(command, previousDirectory);
      if (requestedDirectory === null) {
        appendHistoryEntry({
          command,
          cwd: currentDirectory || projectRoot || "",
          exitCode: 1,
          stdout: "",
          stderr: "No previous directory.",
          startedAt,
        });
        setCommandText("");
        return;
      }

      setHistoryEntries((currentEntries) => [
        ...currentEntries,
        {
          id: crypto.randomUUID(),
          command,
          cwd: currentDirectory || projectRoot || "",
          exitCode: null,
          stdout: "",
          stderr: "",
          startedAt,
          completedAt: startedAt,
        },
      ]);
      setCommandText("");
      try {
        const resolvedDirectory = await tauriCodemindRepository.resolveShellDirectory(
          currentDirectory || projectRoot,
          requestedDirectory,
        );
        setPreviousDirectory(currentDirectory || projectRoot || null);
        setCurrentDirectory(resolvedDirectory.cwd);
        updateLastHistoryEntry({
          cwd: resolvedDirectory.cwd,
          exitCode: 0,
          stdout: resolvedDirectory.cwd,
          stderr: "",
        });
      } catch (error) {
        updateLastHistoryEntry({
          exitCode: 1,
          stderr: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    const startedAt = new Date().toISOString();
    const runId = crypto.randomUUID();
    setIsRunning(true);
    setActiveRunId(runId);
    setCommandText("");
    setHistoryIndex(null);
    setHistoryEntries((currentEntries) => [
      ...currentEntries,
      {
        id: runId,
        command,
        cwd: currentDirectory || projectRoot || "",
        exitCode: null,
        stdout: "",
        stderr: "",
        startedAt,
        completedAt: startedAt,
      },
    ]);
    try {
      await tauriCodemindRepository.startShellCommand(
        currentDirectory || projectRoot,
        command,
        shellKind,
        runId,
      );
    } catch (error) {
      updateHistoryEntry(runId, {
        exitCode: 1,
        stderr: error instanceof Error ? error.message : String(error),
      });
      setActiveRunId(null);
      setIsRunning(false);
    }
  }

  function appendHistoryEntry(entry: Omit<ShellHistoryEntry, "id" | "completedAt">) {
    setHistoryEntries((currentEntries) => [
      ...currentEntries,
      {
        ...entry,
        id: crypto.randomUUID(),
        completedAt: new Date().toISOString(),
      },
    ]);
  }

  function updateLastHistoryEntry(entryPatch: Partial<ShellHistoryEntry>) {
    updateHistoryEntryByIndex((currentEntries) => currentEntries.length - 1, entryPatch);
  }

  function updateHistoryEntry(entryId: string, entryPatch: Partial<ShellHistoryEntry>) {
    setHistoryEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === entryId
          ? { ...entry, ...entryPatch, completedAt: new Date().toISOString() }
          : entry,
      ),
    );
  }

  function updateHistoryEntryByIndex(
    selectEntryIndex: (currentEntries: ShellHistoryEntry[]) => number,
    entryPatch: Partial<ShellHistoryEntry>,
  ) {
    setHistoryEntries((currentEntries) => {
      const selectedEntryIndex = selectEntryIndex(currentEntries);
      return currentEntries.map((entry, entryIndex) =>
        entryIndex === selectedEntryIndex
          ? { ...entry, ...entryPatch, completedAt: new Date().toISOString() }
          : entry,
      );
    });
  }

  async function handleStopCommand() {
    if (!activeRunId) {
      return;
    }
    await tauriCodemindRepository.stopShellCommand(activeRunId);
  }

  async function copyEntryOutput(entry: ShellHistoryEntry) {
    const outputText = [entry.stdout, entry.stderr].filter(Boolean).join("\n");
    if (!outputText) {
      return;
    }
    await navigator.clipboard.writeText(outputText);
  }

  function handleHistoryNavigation(direction: -1 | 1) {
    const commands = historyEntries.map((entry) => entry.command).filter(Boolean);
    if (commands.length === 0) {
      return;
    }
    const nextIndex =
      historyIndex === null
        ? commands.length - 1
        : Math.min(Math.max(historyIndex + direction, 0), commands.length - 1);
    setHistoryIndex(nextIndex);
    setCommandText(commands[nextIndex] ?? "");
  }

  return (
    <section className="flex h-full flex-col border-t border-zinc-800 bg-[#181818]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
        <div className="flex min-w-0 items-center gap-3 text-sm font-medium text-zinc-200">
          <Terminal size={15} />
          <select
            className="rounded border border-zinc-700 bg-[#242424] px-2 py-1 text-xs text-zinc-200 outline-none"
            value={shellKind}
            onChange={(event) => setShellKind(event.target.value as ShellKind)}
          >
            <option value="powerShell">PowerShell</option>
            <option value="commandPrompt">Command Prompt</option>
          </select>
          <span className="truncate text-xs font-normal text-zinc-500">
            {formatDirectory(currentDirectory || projectRoot || "Workspace")}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            className="h-7 w-7 px-0"
            variant="ghost"
            title="Clear terminal"
            icon={<Trash2 size={14} />}
            onClick={() => setHistoryEntries([])}
          />
          {activeRunId ? (
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
        {historyEntries.map((entry) => (
          <div key={entry.id} className="mb-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-zinc-400">
              <span className="text-zinc-500">{formatDirectory(entry.cwd)}</span>
              <span className="min-w-0 flex-1 text-zinc-300"> &gt; {entry.command}</span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  entry.exitCode === 0
                    ? "border-emerald-500/30 text-emerald-200"
                    : entry.exitCode === null
                      ? "border-sky-500/30 text-sky-200"
                      : "border-red-500/30 text-red-200"
                }`}
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
          <span className="shrink-0 text-zinc-500">{formatDirectory(currentDirectory || projectRoot || "")}</span>
          <span>&gt;</span>
          <input
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-100 outline-none"
            autoFocus
            value={commandText}
            onChange={(event) => setCommandText(event.target.value)}
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
