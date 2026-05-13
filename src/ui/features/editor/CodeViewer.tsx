import Editor, { DiffEditor, type BeforeMount, type OnMount } from "@monaco-editor/react";
import { FileCode, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiffProposal } from "../../../domain/models/approval";
import type { FileChangeSummary } from "../../../domain/logic/diffAnnotations";
import { createLineChangeAnnotations } from "../../../domain/logic/diffAnnotations";
import {
  useProjectFile,
  useSaveProjectFile,
} from "../../../application/use-cases/sessionQueries";
import { Badge } from "../../components/badge/Badge";
import { Button } from "../../components/button/Button";
import { Panel } from "../../components/panel/Panel";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { cn } from "../../lib/classNames";
import {
  getEditorLanguageId,
  registerEditorLanguages,
} from "./editorLanguageRegistry";

interface CodeViewerProps {
  projectRoot: string | null;
  selectedFilePath: string | null;
  selectedDiff: DiffProposal | null;
  fileChangeSummaryByPath: Record<string, FileChangeSummary>;
}

export function CodeViewer({
  projectRoot,
  selectedFilePath,
  selectedDiff,
  fileChangeSummaryByPath,
}: CodeViewerProps) {
  const [draftContent, setDraftContent] = useState("");
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const projectFile = useProjectFile(projectRoot, selectedFilePath);
  const saveProjectFile = useSaveProjectFile(projectRoot, selectedFilePath);
  const openFileTabs = useWorkspaceStore((store) => store.openFileTabs);
  const setSelectedFilePath = useWorkspaceStore((store) => store.setSelectedFilePath);
  const closeFileTab = useWorkspaceStore((store) => store.closeFileTab);
  const language = getEditorLanguageId(selectedFilePath, projectFile.data?.language);
  const selectedFileChangeSummary = selectedFilePath
    ? fileChangeSummaryByPath[selectedFilePath]
    : undefined;
  const editorDiffProposal = selectedDiff ?? selectedFileChangeSummary?.proposal ?? null;
  const lineChangeAnnotations = useMemo(
    () => createLineChangeAnnotations(editorDiffProposal),
    [editorDiffProposal],
  );
  const hasUnsavedEditorChanges =
    Boolean(selectedFilePath) && draftContent !== (projectFile.data?.content ?? "");

  useEffect(() => {
    setDraftContent(projectFile.data?.content ?? "");
  }, [projectFile.data?.absolutePath, projectFile.data?.content]);

  useEffect(() => {
    const editorModel = editorRef.current?.getModel();
    if (!editorModel || !monacoRef.current) {
      return;
    }

    monacoRef.current.editor.setModelLanguage(editorModel, language);
    void applyTextMateHighlighting(monacoRef.current, language);
  }, [language, selectedFilePath]);

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
  }, [lineChangeAnnotations, selectedDiff]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const editorModel = editor.getModel();
    if (editorModel) {
      monaco.editor.setModelLanguage(editorModel, language);
    }
    void applyTextMateHighlighting(monaco, language);
  };

  const configureEditorLanguageDefaults: BeforeMount = (monaco) => {
    registerEditorLanguages(monaco);
    void import("./textmateHighlighting").then(
      ({ configureTextMateHighlighting, ensureTextMateLanguage, getTextMateThemeName }) => {
        configureTextMateHighlighting(monaco);
        void ensureTextMateLanguage(monaco, language).then(() => {
          monaco.editor.setTheme(getTextMateThemeName());
        });
      },
    ).catch(() => {
      monaco.editor.setTheme("vs-dark");
    });

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

    await saveProjectFile.mutateAsync(draftContent);
  }

  return (
    <Panel className="flex h-full min-w-0 flex-1 flex-col bg-[#121212]">
      <div className="flex h-10 shrink-0 items-end justify-between border-b border-zinc-800 bg-[#1a1a1a] px-2">
        <div className="flex min-w-0 items-end">
        {openFileTabs.length === 0 ? (
          <div className="flex h-9 items-center px-3 text-xs text-zinc-500">No open tabs</div>
        ) : null}
        {openFileTabs.map((filePath) => (
          <button
            key={filePath}
            className={cn(
              "group/tab flex h-9 max-w-56 items-center gap-2 rounded-t-md border border-b-0 px-3 text-xs text-zinc-300",
              selectedFilePath === filePath
                ? "border-zinc-700 bg-[#242424] text-zinc-100"
                : "border-transparent bg-transparent hover:bg-[#202020]",
              getTabChangeClasses(fileChangeSummaryByPath[filePath]),
            )}
            onClick={() => setSelectedFilePath(filePath)}
          >
            <FileCode size={13} />
            <span className="truncate">{getFileName(filePath)}</span>
            <span
              className="rounded p-0.5 hover:bg-zinc-700"
              onClick={(event) => {
                event.stopPropagation();
                closeFileTab(filePath);
              }}
            >
              {selectedFilePath === filePath && hasUnsavedEditorChanges ? (
                <>
                  <span className="block h-2 w-2 rounded-full bg-zinc-400 group-hover/tab:hidden" />
                  <X className="hidden group-hover/tab:block" size={12} />
                </>
              ) : (
                <X size={12} />
              )}
            </span>
          </button>
        ))}
        </div>
        <div className="flex items-center gap-2">
          {editorDiffProposal ? (
            <Badge>
              {editorDiffProposal.originalContent.length === 0 ? "New file" : "Pending diff"}
            </Badge>
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
            onChange={(value) => setDraftContent(value ?? "")}
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

async function applyTextMateHighlighting(
  monaco: Parameters<BeforeMount>[0],
  language: string,
) {
  try {
    const {
      configureTextMateHighlighting,
      ensureTextMateLanguage,
      getTextMateThemeName,
    } = await import("./textmateHighlighting");
    configureTextMateHighlighting(monaco);
    await ensureTextMateLanguage(monaco, language);
    monaco.editor.setTheme(getTextMateThemeName());
  } catch {
    monaco.editor.setTheme("vs-dark");
  }
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
