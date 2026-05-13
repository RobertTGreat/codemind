import { Terminal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ShellCommandOutput, ShellKind } from "../../../domain/models/shell";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { Button } from "../../components/button/Button";

interface CommandShellProps {
  projectRoot: string | null;
}

interface ShellHistoryEntry extends ShellCommandOutput {
  id: string;
}

export function CommandShell({ projectRoot }: CommandShellProps) {
  const [commandText, setCommandText] = useState("");
  const [historyEntries, setHistoryEntries] = useState<ShellHistoryEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [shellKind, setShellKind] = useState<ShellKind>("powerShell");
  const [currentDirectory, setCurrentDirectory] = useState(projectRoot ?? "");
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

    if (command.toLowerCase().startsWith("cd ")) {
      const nextDirectory = resolveNextDirectory(currentDirectory, command.slice(3).trim());
      setCurrentDirectory(nextDirectory);
      setHistoryEntries((currentEntries) => [
        ...currentEntries,
        {
          id: crypto.randomUUID(),
          command,
          cwd: nextDirectory,
          exitCode: 0,
          stdout: "",
          stderr: "",
        },
      ]);
      setCommandText("");
      return;
    }

    setIsRunning(true);
    setCommandText("");
    setHistoryIndex(null);
    try {
      const output = await tauriCodemindRepository.runShellCommand(
        currentDirectory || projectRoot,
        command,
        shellKind,
      );
      setHistoryEntries((currentEntries) => [
        ...currentEntries,
        { ...output, id: crypto.randomUUID() },
      ]);
      setCurrentDirectory(output.cwd);
    } catch (error) {
      setHistoryEntries((currentEntries) => [
        ...currentEntries,
        {
          id: crypto.randomUUID(),
          command,
          cwd: currentDirectory || projectRoot || "",
          exitCode: 1,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        },
      ]);
    } finally {
      setIsRunning(false);
    }
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
            <div className="mb-1 text-zinc-400">
              <span className="text-zinc-500">{formatDirectory(entry.cwd)}</span>
              <span className="text-zinc-300"> &gt; {entry.command}</span>
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

function resolveNextDirectory(currentDirectory: string, requestedDirectory: string): string {
  if (!requestedDirectory || requestedDirectory === ".") {
    return currentDirectory;
  }
  if (requestedDirectory === "..") {
    return currentDirectory.replace(/[\\/][^\\/]+[\\/]?$/, "");
  }
  if (/^[a-zA-Z]:[\\/]/.test(requestedDirectory) || requestedDirectory.startsWith("\\\\")) {
    return requestedDirectory;
  }
  return `${currentDirectory.replace(/[\\/]$/, "")}\\${requestedDirectory}`;
}

function formatDirectory(directory: string): string {
  return directory.replace(/^\\\\\?\\/, "").trim();
}
