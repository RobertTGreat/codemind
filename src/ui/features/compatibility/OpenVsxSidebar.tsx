import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Package,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { Button } from "../../components/button/Button";
import { Badge } from "../../components/badge/Badge";

interface OpenVsxSidebarProps {
  projectRoot: string | null;
  width: number;
  onResize: (width: number) => void;
}

interface OpenVsxSearchResponse {
  totalSize: number;
  extensions: OpenVsxExtensionSummary[];
}

interface OpenVsxExtensionSummary {
  url: string;
  name: string;
  namespace: string;
  version: string;
  timestamp?: string;
  displayName?: string;
  description?: string;
  downloadCount?: number;
  averageRating?: number;
  verified?: boolean;
  deprecated?: boolean;
  files?: {
    icon?: string;
    download?: string;
  };
}

interface OpenVsxExtensionDetails extends OpenVsxExtensionSummary {
  namespaceDisplayName?: string;
  timestamp?: string;
  reviewCount?: number;
  license?: string;
  repository?: string;
  bugs?: string;
  categories?: string[];
  tags?: string[];
  engines?: {
    vscode?: string;
  };
  replacement?: {
    displayName?: string;
    url?: string;
  };
  files?: OpenVsxExtensionSummary["files"] & {
    readme?: string;
    changelog?: string;
    manifest?: string;
  };
}

const OPEN_VSX_BASE_URL = "https://open-vsx.org";
type OpenVsxSortMode = "downloads" | "rating" | "name" | "updated";

export function OpenVsxSidebar({ projectRoot, width, onResize }: OpenVsxSidebarProps) {
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<OpenVsxExtensionSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<OpenVsxSortMode>("downloads");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [installingExtensionId, setInstallingExtensionId] = useState<string | null>(null);
  const [installStatusByExtensionId, setInstallStatusByExtensionId] = useState<
    Record<string, { kind: "success" | "error"; message: string }>
  >({});
  const [selectedExtension, setSelectedExtension] =
    useState<OpenVsxExtensionDetails | null>(null);
  const [isLoadingExtension, setIsLoadingExtension] = useState(false);
  const normalizedSearchText = searchText.trim();
  const selectedExtensionId = selectedExtension
    ? `${selectedExtension.namespace}.${selectedExtension.name}`
    : "";
  const sortedSearchResults = useMemo(
    () => sortOpenVsxResults(searchResults, sortMode),
    [searchResults, sortMode],
  );
  const displayedWidth = previewWidth ?? width;

  useEffect(() => {
    if (normalizedSearchText.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `${OPEN_VSX_BASE_URL}/api/-/search?query=${encodeURIComponent(
            normalizedSearchText,
          )}&size=25`,
          { signal: abortController.signal },
        );

        if (!response.ok) {
          throw new Error("Open VSX search failed");
        }

        const searchResponse = (await response.json()) as OpenVsxSearchResponse;
        setSearchResults(searchResponse.extensions ?? []);
      } catch (error) {
        if (!abortController.signal.aborted) {
          setSearchError(error instanceof Error ? error.message : "Open VSX search failed");
          setSearchResults([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedSearchText]);

  const extensionPageUrl = useMemo(() => {
    if (!selectedExtension) {
      return OPEN_VSX_BASE_URL;
    }

    return `${OPEN_VSX_BASE_URL}/extension/${selectedExtension.namespace}/${selectedExtension.name}`;
  }, [selectedExtension]);

  async function openExtensionDetails(extensionSummary: OpenVsxExtensionSummary) {
    setIsLoadingExtension(true);
    setSelectedExtension({
      ...extensionSummary,
      displayName: extensionSummary.displayName ?? extensionSummary.name,
    });

    try {
      const response = await fetch(extensionSummary.url);
      if (!response.ok) {
        throw new Error("Extension details could not be loaded");
      }
      const extensionDetails = (await response.json()) as OpenVsxExtensionDetails;
      setSelectedExtension(extensionDetails);
    } catch {
      setSelectedExtension({
        ...extensionSummary,
        displayName: extensionSummary.displayName ?? extensionSummary.name,
      });
    } finally {
      setIsLoadingExtension(false);
    }
  }

  async function installExtension(extension: OpenVsxExtensionSummary) {
    const extensionId = getExtensionId(extension);
    const downloadUrl = extension.files?.download;
    if (!downloadUrl) {
      setInstallStatusByExtensionId((currentStatusByExtensionId) => ({
        ...currentStatusByExtensionId,
        [extensionId]: {
          kind: "error",
          message: "This extension does not expose a VSIX download.",
        },
      }));
      return;
    }

    setInstallingExtensionId(extensionId);
    setInstallStatusByExtensionId((currentStatusByExtensionId) => {
      const nextStatusByExtensionId = { ...currentStatusByExtensionId };
      delete nextStatusByExtensionId[extensionId];
      return nextStatusByExtensionId;
    });

    try {
      const installResult = await tauriCodemindRepository.installOpenVsxExtension(
        extensionId,
        downloadUrl,
      );
      setInstallStatusByExtensionId((currentStatusByExtensionId) => ({
        ...currentStatusByExtensionId,
        [extensionId]: {
          kind: "success",
          message: `Installed with ${installResult.installedWith}.`,
        },
      }));
    } catch (error) {
      setInstallStatusByExtensionId((currentStatusByExtensionId) => ({
        ...currentStatusByExtensionId,
        [extensionId]: {
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "Extension install failed.",
        },
      }));
    } finally {
      setInstallingExtensionId(null);
    }
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-[#181818]"
      style={{ width: displayedWidth }}
    >
      <div className="flex h-10 shrink-0 items-end gap-1 border-b border-zinc-800 px-2">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-t-md border border-b-0 border-transparent bg-transparent px-3 text-zinc-400 focus-within:border-zinc-700">
          <Search size={13} />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder="Search Open VSX..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
        <div className="relative flex h-9 items-center">
            <Button
              className="h-8 w-8 px-0"
              variant="ghost"
              title="Sort Open VSX results"
              icon={<SlidersHorizontal size={14} />}
              onClick={() => setIsSortMenuOpen((isOpen) => !isOpen)}
            />
            {isSortMenuOpen ? (
              <SortDropdown
                sortMode={sortMode}
                onChangeSortMode={(nextSortMode) => {
                  setSortMode(nextSortMode);
                  setIsSortMenuOpen(false);
                }}
              />
            ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {normalizedSearchText.length < 2 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-500">
            Type at least two characters to search extensions by name, publisher,
            language, or framework.
          </div>
        ) : null}
        {isSearching ? (
          <p className="p-3 text-xs text-zinc-500">Searching Open VSX...</p>
        ) : null}
        {searchError ? (
          <div className="flex gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {searchError}
          </div>
        ) : null}
        {!isSearching && normalizedSearchText.length >= 2 && searchResults.length === 0 && !searchError ? (
          <p className="p-3 text-xs text-zinc-500">No extensions found.</p>
        ) : null}
        <div className="space-y-2">
          {sortedSearchResults.map((extension) => (
            <ExtensionResultCard
              key={getExtensionId(extension)}
              extension={extension}
              isInstalling={installingExtensionId === getExtensionId(extension)}
              installStatus={installStatusByExtensionId[getExtensionId(extension)]}
              onOpenDetails={openExtensionDetails}
              onInstall={installExtension}
            />
          ))}
        </div>
      </div>

      {selectedExtension ? (
        <ExtensionDetailsOverlay
          extensionDetails={selectedExtension}
          extensionPageUrl={extensionPageUrl}
          isLoading={isLoadingExtension}
          projectRoot={projectRoot}
          extensionId={selectedExtensionId}
          isInstalling={installingExtensionId === selectedExtensionId}
          installStatus={installStatusByExtensionId[selectedExtensionId]}
          onInstall={() => void installExtension(selectedExtension)}
          onClose={() => setSelectedExtension(null)}
        />
      ) : null}
      <SidebarResizeHandle
        initialWidth={displayedWidth}
        onPreview={setPreviewWidth}
        onResize={(nextWidth) => {
          setPreviewWidth(null);
          onResize(nextWidth);
        }}
      />
    </aside>
  );
}

function ExtensionResultCard({
  extension,
  isInstalling,
  installStatus,
  onOpenDetails,
  onInstall,
}: {
  extension: OpenVsxExtensionSummary;
  isInstalling: boolean;
  installStatus: { kind: "success" | "error"; message: string } | undefined;
  onOpenDetails: (extension: OpenVsxExtensionSummary) => void;
  onInstall: (extension: OpenVsxExtensionSummary) => void;
}) {
  return (
    <article className="rounded-md border border-transparent p-2 transition hover:border-zinc-800 hover:bg-zinc-900">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => void onOpenDetails(extension)}
      >
        <span className="flex gap-2">
          {extension.files?.icon ? (
            <img
              className="h-8 w-8 shrink-0 rounded object-cover"
              src={extension.files.icon}
              alt=""
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-400">
              <Package size={15} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-medium text-zinc-100">
                {extension.displayName ?? extension.name}
              </span>
              {extension.verified ? (
                <ShieldCheck size={12} className="shrink-0 text-emerald-300" />
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
              {extension.namespace}.{extension.name}
            </span>
            {extension.description ? (
              <span className="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-500">
                {extension.description}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-2">
        <span className="truncate text-[11px] text-zinc-500">
          {formatCount(extension.downloadCount)} downloads
        </span>
        {extension.files?.download ? (
          <Button
            className="h-7 shrink-0 px-2"
            variant="primary"
            icon={<Download size={12} />}
            disabled={isInstalling}
            onClick={(event) => {
              event.stopPropagation();
              void onInstall(extension);
            }}
          >
            {isInstalling ? "Installing" : "Install"}
          </Button>
        ) : null}
      </div>
      {installStatus ? (
        <p className={`mt-2 text-xs leading-5 ${getInstallStatusClassName(installStatus)}`}>
          {installStatus.message}
        </p>
      ) : null}
    </article>
  );
}

function getExtensionId(extension: OpenVsxExtensionSummary) {
  return `${extension.namespace}.${extension.name}`;
}

function getInstallStatusClassName(
  installStatus: { kind: "success" | "error"; message: string } | undefined,
) {
  if (!installStatus) {
    return "";
  }

  return installStatus.kind === "success" ? "text-emerald-300" : "text-red-300";
}

function ExtensionDetailsOverlay({
  extensionDetails,
  extensionPageUrl,
  isLoading,
  projectRoot,
  extensionId,
  isInstalling,
  installStatus,
  onInstall,
  onClose,
}: {
  extensionDetails: OpenVsxExtensionDetails;
  extensionPageUrl: string;
  isLoading: boolean;
  projectRoot: string | null;
  extensionId: string;
  isInstalling: boolean;
  installStatus: { kind: "success" | "error"; message: string } | undefined;
  onInstall: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#181818]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800 px-3">
        <div className="min-w-0 text-xs font-medium text-zinc-200">
          Extension details
        </div>
        <Button
          className="h-7 w-7 px-0"
          variant="ghost"
          title="Close"
          icon={<X size={14} />}
          onClick={onClose}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex gap-3">
          {extensionDetails.files?.icon ? (
            <img
              className="h-12 w-12 shrink-0 rounded object-cover"
              src={extensionDetails.files.icon}
              alt=""
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-400">
              <Package size={20} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-zinc-100">
              {extensionDetails.displayName ?? extensionDetails.name}
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{extensionId}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {extensionDetails.verified ? (
                <Badge className="text-emerald-200">Verified</Badge>
              ) : null}
              {extensionDetails.deprecated ? (
                <Badge className="text-orange-200">Deprecated</Badge>
              ) : null}
              <Badge>v{extensionDetails.version}</Badge>
            </div>
          </div>
        </div>

        {isLoading ? <p className="mb-3 text-xs text-zinc-500">Loading details...</p> : null}
        {extensionDetails.description ? (
          <p className="mb-3 text-xs leading-5 text-zinc-300">
            {extensionDetails.description}
          </p>
        ) : null}
        {extensionDetails.replacement ? (
          <div className="mb-3 rounded-md border border-orange-500/20 bg-orange-500/10 p-2 text-xs leading-5 text-orange-100">
            Replacement: {extensionDetails.replacement.displayName ?? extensionDetails.replacement.url}
          </div>
        ) : null}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <Metric
            icon={<Download size={13} />}
            label="Downloads"
            value={formatCount(extensionDetails.downloadCount)}
          />
          <Metric
            icon={<Star size={13} />}
            label="Rating"
            value={
              extensionDetails.averageRating
                ? extensionDetails.averageRating.toFixed(1)
                : "n/a"
            }
          />
          <Metric label="VS Code" value={extensionDetails.engines?.vscode ?? "n/a"} />
          <Metric label="License" value={extensionDetails.license ?? "n/a"} />
        </div>

        {extensionDetails.categories?.length ? (
          <InfoList title="Categories" values={extensionDetails.categories} />
        ) : null}
        {extensionDetails.tags?.length ? (
          <InfoList title="Tags" values={extensionDetails.tags.slice(0, 12)} />
        ) : null}

        <div className="mt-4 space-y-2">
          {projectRoot ? (
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-400">
              <CheckCircle2 size={13} className="shrink-0 text-emerald-300" />
              Project selected for compatibility work.
            </div>
          ) : null}
          <Button
            className="h-8 w-full justify-start"
            variant="secondary"
            icon={<ExternalLink size={14} />}
            onClick={() => window.open(extensionPageUrl, "_blank")}
          >
            Open page
          </Button>
          {extensionDetails.files?.download ? (
            <Button
              className="h-8 w-full justify-start"
              variant="primary"
              icon={<Download size={14} />}
              disabled={isInstalling}
              onClick={onInstall}
            >
              {isInstalling ? "Installing" : "Install / Download VSIX"}
            </Button>
          ) : null}
          {installStatus ? (
            <p className={`text-xs leading-5 ${getInstallStatusClassName(installStatus)}`}>
              {installStatus.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SidebarResizeHandle({
  initialWidth,
  onPreview,
  onResize,
}: {
  initialWidth: number;
  onPreview: (width: number) => void;
  onResize: (width: number) => void;
}) {
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
      className="absolute right-[-3px] top-0 z-40 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-zinc-500"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={handlePointerDown}
    />
  );
}

function SortDropdown({
  sortMode,
  onChangeSortMode,
}: {
  sortMode: OpenVsxSortMode;
  onChangeSortMode: (sortMode: OpenVsxSortMode) => void;
}) {
  return (
    <div className="absolute right-0 top-9 z-40 w-44 rounded-md border border-zinc-800 bg-[#202020] p-1 shadow-2xl">
      {[
        ["downloads", "Download count"],
        ["rating", "Rating"],
        ["name", "Name"],
        ["updated", "Recently updated"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={`w-full rounded px-2 py-1.5 text-left text-xs ${
            sortMode === value
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          }`}
          onClick={() => onChangeSortMode(value as OpenVsxSortMode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="truncate text-xs text-zinc-200">{value}</div>
    </div>
  );
}

function InfoList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs font-medium text-zinc-300">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} className="text-zinc-400">
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function formatCount(value: number | undefined) {
  if (!value) {
    return "0";
  }

  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function sortOpenVsxResults(
  extensions: OpenVsxExtensionSummary[],
  sortMode: OpenVsxSortMode,
) {
  return [...extensions].sort((leftExtension, rightExtension) => {
    if (sortMode === "rating") {
      return (rightExtension.averageRating ?? 0) - (leftExtension.averageRating ?? 0);
    }

    if (sortMode === "name") {
      return (leftExtension.displayName ?? leftExtension.name).localeCompare(
        rightExtension.displayName ?? rightExtension.name,
      );
    }

    if (sortMode === "updated") {
      return (rightExtension.timestamp ?? "").localeCompare(leftExtension.timestamp ?? "");
    }

    return (rightExtension.downloadCount ?? 0) - (leftExtension.downloadCount ?? 0);
  });
}
