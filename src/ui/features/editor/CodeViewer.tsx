import Editor, { DiffEditor, type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FileCode, GitCompare, LoaderCircle, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiffProposal } from "../../../domain/models/approval";
import type { FileChangeSummary } from "../../../domain/logic/diffAnnotations";
import type { GitChangedFile } from "../../../domain/models/git";
import type { ProjectFile } from "../../../domain/models/project";
import { createLineChangeAnnotations } from "../../../domain/logic/diffAnnotations";
import {
  codemindQueryKeys,
  useGitFileVersion,
  useGitStatus,
  useProjectFile,
  useSaveProjectFile,
} from "../../../application/use-cases/sessionQueries";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { Button } from "../../components/button/Button";
import { Panel } from "../../components/panel/Panel";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { cn } from "../../lib/classNames";
import {
  getEditorLanguageId,
  registerEditorLanguage,
  registerEditorLanguages,
} from "./editorLanguageRegistry";

interface CodeViewerProps {
  projectRoot: string | null;
  selectedFilePath: string | null;
  selectedDiff: DiffProposal | null;
  gitRevealRequest: {
    path: string;
    source: "working" | "staged";
    requestId: number;
  } | null;
  fileChangeSummaryByPath: Record<string, FileChangeSummary>;
  onSelectFile: (relativePath: string) => void;
  onClearSelectedDiff: () => void;
}

const MAX_TEXTMATE_FILE_BYTES = 200 * 1024;

export function CodeViewer({
  projectRoot,
  selectedFilePath,
  selectedDiff,
  gitRevealRequest,
  fileChangeSummaryByPath,
  onSelectFile,
  onClearSelectedDiff,
}: CodeViewerProps) {
  const [draftContentByPath, setDraftContentByPath] = useState<Record<string, string>>({});
  const [savedContentByPath, setSavedContentByPath] = useState<Record<string, string>>({});
  const [gitDiffSource, setGitDiffSource] = useState<"working" | "staged">("working");
  const [editorMountVersion, setEditorMountVersion] = useState(0);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const savedContentByPathRef = useRef<Record<string, string>>({});
  const highlightingRequestRef = useRef(0);
  const queryClient = useQueryClient();
  const projectFile = useProjectFile(projectRoot, selectedFilePath);
  const saveProjectFile = useSaveProjectFile(projectRoot, selectedFilePath);
  const gitStatus = useGitStatus(projectRoot);
  const openFileTabs = useWorkspaceStore((store) => store.openFileTabs);
  const closeFileTab = useWorkspaceStore((store) => store.closeFileTab);
  const language = getEditorLanguageId(selectedFilePath, projectFile.data?.language);
  const selectedFileChangeSummary = selectedFilePath
    ? fileChangeSummaryByPath[selectedFilePath]
    : undefined;
  const selectedGitChangedFile = useMemo(
    () => findGitChangedFile(gitStatus.data?.changedFiles ?? [], selectedFilePath),
    [gitStatus.data?.changedFiles, selectedFilePath],
  );
  const draftContent =
    selectedFilePath
      ? draftContentByPath[selectedFilePath] ?? projectFile.data?.content ?? ""
      : "";
  const dirtyFilePaths = openFileTabs.filter((filePath) => isFileDirty(filePath));
  const hasUnsavedEditorChanges =
    Boolean(selectedFilePath) && isFileDirty(selectedFilePath);
  const hasSelectedWorkingTreeChanges =
    Boolean(selectedGitChangedFile?.isUnstaged || selectedGitChangedFile?.isUntracked);
  const hasSelectedStagedChanges = Boolean(selectedGitChangedFile?.isStaged);
  const canShowGitDiff =
    Boolean(selectedFilePath && selectedGitChangedFile) && !selectedDiff;
  const isViewingStagedGitDiff =
    gitDiffSource === "staged" && hasSelectedStagedChanges;
  const gitFileVersion = useGitFileVersion(
    projectRoot,
    selectedFilePath,
    isViewingStagedGitDiff,
    canShowGitDiff,
  );
  const gitDiffProposal = useMemo<DiffProposal | null>(() => {
    if (!selectedFilePath || !gitFileVersion.data) {
      return null;
    }

    return {
      id: `git:${selectedFilePath}:${gitDiffSource}`,
      sessionId: "",
      relativePath: selectedFilePath,
      originalContent: gitFileVersion.data.originalContent,
      proposedContent: isViewingStagedGitDiff
        ? gitFileVersion.data.modifiedContent
        : draftContent,
      diffText: "",
      status: "pending",
      createdAt: "",
    };
  }, [
    draftContent,
    gitDiffSource,
    gitFileVersion.data,
    isViewingStagedGitDiff,
    selectedFilePath,
  ]);
  const editorDiffProposal =
    selectedDiff ?? selectedFileChangeSummary?.proposal ?? gitDiffProposal;
  const lineChangeAnnotations = useMemo(
    () => createLineChangeAnnotations(editorDiffProposal),
    [editorDiffProposal],
  );

  useEffect(() => {
    savedContentByPathRef.current = savedContentByPath;
  }, [savedContentByPath]);

  useEffect(() => {
    setGitDiffSource(
      selectedGitChangedFile?.isStaged && !selectedGitChangedFile.isUnstaged
        ? "staged"
        : "working",
    );
  }, [
    selectedFilePath,
    selectedGitChangedFile?.isStaged,
    selectedGitChangedFile?.isUnstaged,
  ]);

  useEffect(() => {
    if (gitRevealRequest?.path === selectedFilePath) {
      setGitDiffSource(gitRevealRequest.source);
    }
  }, [gitRevealRequest?.path, gitRevealRequest?.requestId, gitRevealRequest?.source, selectedFilePath]);

  useEffect(() => {
    if (!selectedFilePath || !projectFile.data) {
      return;
    }

    const loadedContent = projectFile.data.content;
    setSavedContentByPath((currentSavedContentByPath) => ({
      ...currentSavedContentByPath,
      [selectedFilePath]: loadedContent,
    }));
    setDraftContentByPath((currentDraftContentByPath) => {
      const currentDraftContent = currentDraftContentByPath[selectedFilePath];
      const previousSavedContent = savedContentByPathRef.current[selectedFilePath];
      if (
        currentDraftContent !== undefined &&
        previousSavedContent !== undefined &&
        currentDraftContent !== previousSavedContent
      ) {
        return currentDraftContentByPath;
      }

      return {
        ...currentDraftContentByPath,
        [selectedFilePath]: loadedContent,
      };
    });
  }, [
    projectFile.data?.absolutePath,
    projectFile.data?.content,
    selectedFilePath,
  ]);

  useEffect(() => {
    const editorModel = editorRef.current?.getModel();
    const monaco = monacoRef.current;

    if (!editorModel || !monaco) {
      return;
    }

    const requestId = ++highlightingRequestRef.current;
    const loadedFileSize = projectFile.data?.content.length ?? 0;

    registerEditorLanguage(monaco, language);
    monaco.editor.setModelLanguage(editorModel, language);

    void applyTextMateHighlightingOnce({
      monaco,
      language,
      fileSizeBytes: loadedFileSize,
      isCurrentRequest: () => highlightingRequestRef.current === requestId,
    });
  }, [language, projectFile.data?.absolutePath, projectFile.data?.content.length]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || selectedDiff) {
      return;
    }

    decorationIdsRef.current = editorRef.current.deltaDecorations(
      decorationIdsRef.current,
      lineChangeAnnotations.map((annotation) => ({
        range: new monacoRef.current!.Range(
          annotation.lineNumber,
          1,
          annotation.lineNumber,
          1,
        ),
        options: {
          isWholeLine: true,
          className:
            annotation.status === "new"
              ? "codemind-line-new"
              : "codemind-line-changed",
          glyphMarginClassName:
            annotation.status === "new"
              ? "codemind-glyph-new"
              : "codemind-glyph-changed",
          hoverMessage: {
            value: createPreviousLineHoverMessage(annotation.previousText),
          },
        },
      })),
    );
  }, [editorMountVersion, lineChangeAnnotations, selectedDiff, selectedFilePath]);

  useEffect(() => {
    if (
      !editorRef.current ||
      !gitRevealRequest ||
      gitRevealRequest.path !== selectedFilePath ||
      lineChangeAnnotations.length === 0
    ) {
      return;
    }

    const firstChangedLine = lineChangeAnnotations[0];
    editorRef.current.revealLineInCenter(firstChangedLine.lineNumber);
    editorRef.current.setPosition({
      lineNumber: firstChangedLine.lineNumber,
      column: 1,
    });
    editorRef.current.focus();
  }, [
    gitRevealRequest?.path,
    gitRevealRequest?.requestId,
    lineChangeAnnotations,
    selectedFilePath,
  ]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorMountVersion((currentVersion) => currentVersion + 1);

    const editorModel = editor.getModel();
    if (editorModel) {
      const requestId = ++highlightingRequestRef.current;
      const loadedFileSize = projectFile.data?.content.length ?? draftContent.length;

      registerEditorLanguage(monaco, language);
      monaco.editor.setModelLanguage(editorModel, language);
      void applyTextMateHighlightingOnce({
        monaco,
        language,
        fileSizeBytes: loadedFileSize,
        isCurrentRequest: () => highlightingRequestRef.current === requestId,
      });
    }
  };

  const configureEditorLanguageDefaults: BeforeMount = (monaco) => {
    registerEditorLanguages(monaco);
    monaco.editor.setTheme("vs-dark");

    const sharedCompilerOptions = {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      target: monaco.languages.typescript.ScriptTarget.ES2020,
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...sharedCompilerOptions,
      allowNonTsExtensions: true,
    });
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      ...sharedCompilerOptions,
      allowJs: true,
      checkJs: false,
    });
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
  };

  async function handleSaveEditorChanges() {
    if (!selectedFilePath) {
      return;
    }

    const expectedVersion = projectFile.data?.version;
    const savedFile = await saveProjectFile.mutateAsync({
      content: draftContent,
      expectedVersion,
    });
    queryClient.setQueryData(
      codemindQueryKeys.file(projectRoot, selectedFilePath),
      savedFile,
    );
    setSavedContentByPath((currentSavedContentByPath) => ({
      ...currentSavedContentByPath,
      [selectedFilePath]: savedFile.content,
    }));
    setDraftContentByPath((currentDraftContentByPath) => ({
      ...currentDraftContentByPath,
      [selectedFilePath]: savedFile.content,
    }));
  }

  async function handleSaveAllEditorChanges() {
    if (!projectRoot || dirtyFilePaths.length === 0) {
      return;
    }

    const dirtySnapshots = dirtyFilePaths
      .map((relativePath) => {
        const cachedProjectFile = queryClient.getQueryData<ProjectFile>(
          codemindQueryKeys.file(projectRoot, relativePath),
        );

        return {
          relativePath,
          content: draftContentByPath[relativePath],
          expectedVersion: cachedProjectFile?.version,
        };
      })
      .filter(
        (snapshot): snapshot is {
          relativePath: string;
          content: string;
          expectedVersion: string | undefined;
        } => snapshot.content !== undefined,
      );

    const savedFiles = await mapWithConcurrency(dirtySnapshots, 4, (snapshot) =>
      tauriCodemindRepository.saveProjectFile(
        projectRoot,
        snapshot.relativePath,
        snapshot.content,
        snapshot.expectedVersion,
      ),
    );

    const savedContentPatch: Record<string, string> = Object.fromEntries(
      savedFiles.map((savedFile) => [savedFile.relativePath, savedFile.content]),
    );

    for (const savedFile of savedFiles) {
      queryClient.setQueryData(
        codemindQueryKeys.file(projectRoot, savedFile.relativePath),
        savedFile,
      );
    }

    setSavedContentByPath((currentSavedContentByPath) => ({
      ...currentSavedContentByPath,
      ...savedContentPatch,
    }));

    setDraftContentByPath((currentDraftContentByPath) => ({
      ...currentDraftContentByPath,
      ...savedContentPatch,
    }));

    queryClient.invalidateQueries({ queryKey: codemindQueryKeys.projectTree(projectRoot) });
    queryClient.invalidateQueries({ queryKey: codemindQueryKeys.projectFileIndex(projectRoot) });
    queryClient.invalidateQueries({
      queryKey: ["project-directory", projectRoot],
      exact: false,
    });
    queryClient.invalidateQueries({ queryKey: codemindQueryKeys.gitStatus(projectRoot) });
  }

  function handleCloseFileTab(filePath: string) {
    if (isFileDirty(filePath)) {
      const shouldClose = window.confirm(
        `Close ${getFileName(filePath)} with unsaved changes?`,
      );
      if (!shouldClose) {
        return;
      }
    }

    onClearSelectedDiff();
    closeFileTab(filePath);
  }

  function isFileDirty(filePath: string | null) {
    if (!filePath) {
      return false;
    }

    const savedContent = savedContentByPath[filePath];
    const draftContent = draftContentByPath[filePath];
    return savedContent !== undefined && draftContent !== undefined && draftContent !== savedContent;
  }

  return (
    <Panel className="flex h-full min-w-0 flex-1 flex-col bg-[#121212]">
      <div className="flex h-10 shrink-0 items-end justify-between gap-2 border-b border-zinc-800 bg-[#1a1a1a] px-2">
        <div className="flex min-w-0 flex-1 items-end overflow-hidden">
        {openFileTabs.length === 0 ? (
          <div className="flex h-9 items-center px-3 text-xs text-zinc-500">No open tabs</div>
        ) : null}
        {openFileTabs.map((filePath) => (
          <div
            key={filePath}
            className={cn(
              "group/tab flex h-9 max-w-56 items-center gap-2 rounded-t-md border border-b-0 px-3 text-xs text-zinc-300",
              selectedFilePath === filePath
                ? "border-zinc-700 bg-[#242424] text-zinc-100"
                : "border-transparent bg-transparent hover:bg-[#202020]",
              getTabChangeClasses(fileChangeSummaryByPath[filePath]),
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              aria-current={selectedFilePath === filePath ? "page" : undefined}
              onClick={() => onSelectFile(filePath)}
            >
              <FileCode size={13} className="shrink-0" />
              <span className="truncate">{getFileName(filePath)}</span>
            </button>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-zinc-700"
              aria-label={`Close ${getFileName(filePath)}`}
              onClick={(event) => {
                event.stopPropagation();
                handleCloseFileTab(filePath);
              }}
            >
              {isFileDirty(filePath) ? (
                <>
                  <span className="block h-2 w-2 rounded-full bg-zinc-400 group-hover/tab:hidden" />
                  <X className="hidden group-hover/tab:block" size={12} />
                </>
              ) : (
                <X size={12} />
              )}
            </button>
          </div>
        ))}
        </div>
        <div className="flex h-9 shrink-0 items-center gap-1 pb-1">
          {canShowGitDiff ? (
            <>
              <span
                className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-400"
                title={selectedGitChangedFile?.changeType ?? "Git change"}
                aria-label={selectedGitChangedFile?.changeType ?? "Git change"}
              >
                <GitCompare size={13} />
              </span>
              {gitFileVersion.isLoading ? (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-sky-300"
                  title="Loading Git diff"
                  aria-label="Loading Git diff"
                >
                  <LoaderCircle size={13} className="animate-spin" />
                </span>
              ) : null}
              {gitFileVersion.error ? (
                <span
                  className="flex h-7 w-7 items-center justify-center rounded border border-red-500/30 text-red-300"
                  title="Git diff unavailable"
                  aria-label="Git diff unavailable"
                >
                  <AlertCircle size={13} />
                </span>
              ) : null}
              {hasSelectedWorkingTreeChanges && hasSelectedStagedChanges ? (
                <div className="flex h-7 rounded border border-zinc-800 bg-[#202020] p-0.5">
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1.5 text-[10px]",
                      gitDiffSource === "working"
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-200",
                    )}
                    title="Show working tree changes"
                    onClick={() => setGitDiffSource("working")}
                  >
                    Working
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1.5 text-[10px]",
                      gitDiffSource === "staged"
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-200",
                    )}
                    title="Show staged changes"
                    onClick={() => setGitDiffSource("staged")}
                  >
                    Staged
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
          {editorDiffProposal ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded border border-emerald-500/30 text-emerald-300"
              title={editorDiffProposal.originalContent.length === 0 ? "New file" : "Pending diff"}
              aria-label={editorDiffProposal.originalContent.length === 0 ? "New file" : "Pending diff"}
            >
              <FileCode size={13} />
            </span>
          ) : null}
          {!selectedDiff && selectedFilePath ? (
            <Button
              className="h-8 w-8 px-0"
              variant={hasUnsavedEditorChanges ? "primary" : "secondary"}
              icon={<Save size={14} />}
              disabled={!hasUnsavedEditorChanges || saveProjectFile.isPending}
              onClick={handleSaveEditorChanges}
              title="Save"
            />
          ) : null}
          {dirtyFilePaths.length > 1 ? (
            <Button
              className="h-8 px-2 text-xs"
              variant="secondary"
              icon={<Save size={14} />}
              disabled={saveProjectFile.isPending}
              onClick={handleSaveAllEditorChanges}
              title="Save all"
            >
              Save All
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {selectedDiff ? (
          <DiffEditor
            height="100%"
            language={language}
            original={selectedDiff.originalContent}
            modified={selectedDiff.proposedContent}
            theme="vs-dark"
            beforeMount={configureEditorLanguageDefaults}
            options={{ readOnly: true, renderSideBySide: true }}
          />
        ) : selectedFilePath ? (
          <Editor
            height="100%"
            language={language}
            path={selectedFilePath}
            value={draftContent}
            theme="vs-dark"
            loading={<div className="p-4 text-sm text-zinc-500">Opening file...</div>}
            onChange={(value) => {
              if (!selectedFilePath) {
                return;
              }
              setDraftContentByPath((currentDraftContentByPath) => ({
                ...currentDraftContentByPath,
                [selectedFilePath]: value ?? "",
              }));
            }}
            beforeMount={configureEditorLanguageDefaults}
            onMount={handleEditorMount}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              glyphMargin: true,
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Pick a file or pending diff to inspect it here.
          </div>
        )}
      </div>
    </Panel>
  );
}

function createPreviousLineHoverMessage(previousText: string | null): string {
  if (previousText === null) {
    return "**New line**";
  }

  const escapedPreviousText = previousText.replace(/```/g, "` ` `");
  return `**Previous line**\n\n\`\`\`\n${escapedPreviousText || "(blank line)"}\n\`\`\``;
}

function getFileName(filePath: string): string {
  const pathParts = filePath.split("/");
  return pathParts[pathParts.length - 1] ?? filePath;
}

function findGitChangedFile(
  changedFiles: GitChangedFile[],
  selectedFilePath: string | null,
): GitChangedFile | undefined {
  if (!selectedFilePath) {
    return undefined;
  }

  const normalizedSelectedPath = selectedFilePath.replace(/\\/g, "/");
  return changedFiles.find((changedFile) => {
    const normalizedChangedPath = changedFile.path.replace(/\\/g, "/");
    return (
      normalizedChangedPath === normalizedSelectedPath ||
      normalizedChangedPath.endsWith(`/${normalizedSelectedPath}`)
    );
  });
}

async function applyTextMateHighlightingOnce({
  monaco,
  language,
  fileSizeBytes,
  isCurrentRequest,
}: {
  monaco: Parameters<BeforeMount>[0];
  language: string,
  fileSizeBytes: number;
  isCurrentRequest: () => boolean;
}) {
  if (language === "plaintext" || fileSizeBytes > MAX_TEXTMATE_FILE_BYTES) {
    if (isCurrentRequest()) {
      monaco.editor.setTheme("vs-dark");
    }
    return;
  }

  try {
    const {
      configureTextMateHighlighting,
      ensureTextMateLanguage,
      getTextMateThemeName,
    } = await import("./textmateHighlighting");

    if (!isCurrentRequest()) {
      return;
    }

    configureTextMateHighlighting(monaco);
    await ensureTextMateLanguage(monaco, language);

    if (isCurrentRequest()) {
      monaco.editor.setTheme(getTextMateThemeName());
    }
  } catch {
    if (isCurrentRequest()) {
      monaco.editor.setTheme("vs-dark");
    }
  }
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  mapper: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(inputs[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()),
  );

  return results;
}

function getTabChangeClasses(changeSummary: FileChangeSummary | undefined): string {
  if (!changeSummary) {
    return "";
  }

  if (changeSummary.status === "new") {
    return "border-emerald-500/35 bg-emerald-500/15 text-emerald-100";
  }

  return "border-orange-500/35 bg-orange-500/15 text-orange-100";
}
