import { File, Folder } from "lucide-react";
import { useMemo, useState } from "react";
import type { FileTreeNode } from "../../../domain/models/project";
import type { FileChangeSummary } from "../../../domain/logic/diffAnnotations";
import {
  useProjectDirectory,
  useProjectTree,
  useQuickOpenResults,
} from "../../../application/use-cases/sessionQueries";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { Panel } from "../../components/panel/Panel";
import { cn } from "../../lib/classNames";

interface FileExplorerProps {
  projectRoot: string | null;
  fileChangeSummaryByPath: Record<string, FileChangeSummary>;
  onSelectFile: (relativePath: string) => void;
}

export function FileExplorer({
  projectRoot,
  fileChangeSummaryByPath,
  onSelectFile,
}: FileExplorerProps) {
  const [filterText, setFilterText] = useState("");
  const projectTree = useProjectTree(projectRoot);
  const selectedFilePath = useWorkspaceStore((store) => store.selectedFilePath);
  const quickOpenResults = useQuickOpenResults(projectRoot, filterText);
  const visibleNodes = useMemo(
    () => filterTree(projectTree.data, filterText),
    [projectTree.data, filterText],
  );
  const normalizedFilterText = filterText.trim();
  const isSearching = normalizedFilterText.length >= 2;

  return (
    <Panel className="flex h-full min-w-0 flex-col bg-[#121212]">
      <div className="flex h-10 shrink-0 items-end border-b border-zinc-800 px-2">
        <input
          className="h-9 w-full rounded-t-md border border-b-0 border-transparent bg-transparent px-3 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-700"
          placeholder="Search files..."
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!projectRoot ? (
          <p className="p-3 text-sm text-zinc-500">Select a project folder to browse files.</p>
        ) : null}
        {projectTree.isLoading ? <p className="p-3 text-sm text-zinc-500">Loading tree...</p> : null}
        {normalizedFilterText.length === 1 ? (
          <p className="p-3 text-sm text-zinc-500">Type at least two characters to search.</p>
        ) : null}
        {isSearching ? (
          <div className="space-y-1">
            {quickOpenResults.isFetching && quickOpenResults.data.length === 0 ? (
              <p className="p-3 text-sm text-zinc-500">Indexing files...</p>
            ) : null}
            {quickOpenResults.data.map((searchResult) => (
              <SearchResultRow
                key={searchResult.relativePath}
                searchResult={searchResult}
                changeSummary={fileChangeSummaryByPath[searchResult.relativePath]}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        ) : visibleNodes ? (
          <FileTreeBranch
            node={visibleNodes}
            level={0}
            projectRoot={projectRoot}
            selectedFilePath={selectedFilePath}
            fileChangeSummaryByPath={fileChangeSummaryByPath}
            onSelectFile={onSelectFile}
          />
        ) : null}
      </div>
    </Panel>
  );
}

interface SearchResultRowProps {
  searchResult: {
    name: string;
    relativePath: string;
    parentPath: string;
    isDirectory: boolean;
  };
  changeSummary: FileChangeSummary | undefined;
  onSelectFile: (relativePath: string) => void;
}

function SearchResultRow({
  searchResult,
  changeSummary,
  onSelectFile,
}: SearchResultRowProps) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs hover:bg-zinc-800",
        getFileChangeClasses(changeSummary),
      )}
      onClick={() => {
        if (!searchResult.isDirectory) {
          onSelectFile(searchResult.relativePath);
        }
      }}
    >
      {searchResult.isDirectory ? (
        <Folder className="shrink-0 text-amber-300" size={15} />
      ) : (
        <File className="shrink-0 text-zinc-500" size={15} />
      )}
      <span className="min-w-0">
        <span className="block truncate text-xs text-zinc-200">{searchResult.name}</span>
        {searchResult.parentPath ? (
          <span className="block truncate text-xs text-zinc-500">
            {searchResult.parentPath}
          </span>
        ) : null}
      </span>
      {changeSummary ? <FileChangeDot status={changeSummary.status} /> : null}
    </button>
  );
}

function FileChangeDot({ status }: { status: FileChangeSummary["status"] }) {
  return (
    <span
      className={cn(
        "ml-auto h-2 w-2 shrink-0 rounded-full",
        status === "new" ? "bg-emerald-400" : "bg-orange-400",
      )}
      title={status === "new" ? "New file proposal" : "Changed file proposal"}
    />
  );
}

interface FileTreeBranchProps {
  node: FileTreeNode;
  level: number;
  projectRoot: string | null;
  selectedFilePath: string | null;
  fileChangeSummaryByPath: Record<string, FileChangeSummary>;
  onSelectFile: (relativePath: string) => void;
}

function FileTreeBranch({
  node,
  level,
  projectRoot,
  selectedFilePath,
  fileChangeSummaryByPath,
  onSelectFile,
}: FileTreeBranchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRootNode = level === 0;
  const childDirectory = useProjectDirectory(
    projectRoot,
    node.isDirectory && isExpanded ? node.relativePath : null,
  );
  const childNodes = isRootNode ? node.children : childDirectory.data ?? node.children;

  if (isRootNode) {
    return (
      <div>
        {childNodes.map((childNode) => (
          <FileTreeBranch
            key={childNode.id}
            node={childNode}
            level={1}
            projectRoot={projectRoot}
            selectedFilePath={selectedFilePath}
            fileChangeSummaryByPath={fileChangeSummaryByPath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded border px-2 text-left text-xs text-zinc-300 hover:bg-zinc-800",
          selectedFilePath === node.relativePath && "bg-zinc-800 text-zinc-100",
          getFileChangeClasses(fileChangeSummaryByPath[node.relativePath]),
        )}
        style={{ paddingLeft: 8 + level * 12 }}
        onClick={() => {
          if (node.isDirectory) {
            setIsExpanded((currentValue) => !currentValue);
          } else {
            onSelectFile(node.relativePath);
          }
        }}
      >
        {node.isDirectory ? (
          <Folder className="shrink-0 text-amber-300" size={14} />
        ) : (
          <File className="shrink-0 text-zinc-500" size={14} />
        )}
        <span className="truncate">{node.name}</span>
        {fileChangeSummaryByPath[node.relativePath] ? (
          <FileChangeDot status={fileChangeSummaryByPath[node.relativePath].status} />
        ) : null}
      </button>
      {node.isDirectory && isExpanded
        ? (
            <>
              {childDirectory.isLoading ? (
                <div
                  className="h-7 truncate px-2 text-xs text-zinc-500"
                  style={{ paddingLeft: 24 + level * 12 }}
                >
                  Loading...
                </div>
              ) : null}
              {childNodes.map((childNode) => (
                <FileTreeBranch
                  key={childNode.id}
                  node={childNode}
                  level={level + 1}
                  projectRoot={projectRoot}
                  selectedFilePath={selectedFilePath}
                  fileChangeSummaryByPath={fileChangeSummaryByPath}
                  onSelectFile={onSelectFile}
                />
              ))}
            </>
          )
        : null}
    </div>
  );
}

function getFileChangeClasses(changeSummary: FileChangeSummary | undefined): string {
  if (!changeSummary) {
    return "border-transparent";
  }

  if (changeSummary.status === "new") {
    return "border-emerald-500/25 bg-emerald-500/12 text-emerald-100";
  }

  return "border-orange-500/25 bg-orange-500/12 text-orange-100";
}

function filterTree(node: FileTreeNode | undefined, filterText: string): FileTreeNode | null {
  if (!node) {
    return null;
  }

  const normalizedFilter = filterText.trim().toLowerCase();
  if (!normalizedFilter) {
    return node;
  }

  const matchingChildren = node.children
    .map((childNode) => filterTree(childNode, normalizedFilter))
    .filter((childNode): childNode is FileTreeNode => Boolean(childNode));
  const isMatch = node.name.toLowerCase().includes(normalizedFilter);

  if (isMatch || matchingChildren.length > 0) {
    return { ...node, children: matchingChildren };
  }

  return null;
}
