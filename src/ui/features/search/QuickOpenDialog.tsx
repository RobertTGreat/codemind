import { File, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuickOpenResults } from "../../../application/use-cases/sessionQueries";
import { cn } from "../../lib/classNames";

interface QuickOpenDialogProps {
  isOpen: boolean;
  projectRoot: string | null;
  onSelectFile: (relativePath: string) => void;
  onClose: () => void;
}

export function QuickOpenDialog({
  isOpen,
  projectRoot,
  onSelectFile,
  onClose,
}: QuickOpenDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const quickOpenResults = useQuickOpenResults(projectRoot, query);

  const selectableResults = useMemo(
    () => quickOpenResults.data.filter((entry) => !entry.isDirectory),
    [quickOpenResults.data],
  );

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

  const activeResult = selectableResults[activeIndex];

  return (
    <div className="absolute inset-0 z-50 bg-black/45 px-4 pt-16 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick open file"
        className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-700 bg-[#1f1f1f] shadow-2xl"
      >
        <label className="flex h-11 items-center gap-2 border-b border-zinc-800 px-3 text-sm text-zinc-500">
          <Search size={15} />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
            placeholder="Open file by name or path..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }

              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(index + 1, Math.max(selectableResults.length - 1, 0)),
                );
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }

              if (event.key === "Enter" && activeResult) {
                onSelectFile(activeResult.relativePath);
              }
            }}
          />
          <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
            Ctrl P
          </span>
        </label>

        <div className="max-h-96 overflow-y-auto p-1.5">
          {!projectRoot ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              Select a project folder first.
            </div>
          ) : null}

          {query.trim().length < 2 && projectRoot ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              Type at least two characters.
            </div>
          ) : null}

          {quickOpenResults.isFetching && query.trim().length >= 2 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">Indexing files...</div>
          ) : null}

          {query.trim().length >= 2 && selectableResults.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-zinc-500">
              No matching files.
            </div>
          ) : null}

          {selectableResults.map((entry, index) => (
            <button
              key={entry.relativePath}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left",
                index === activeIndex ? "bg-zinc-800" : "hover:bg-zinc-800",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelectFile(entry.relativePath)}
            >
              <File size={14} className="shrink-0 text-zinc-500" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-zinc-100">
                  {entry.name}
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  {entry.parentPath}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
