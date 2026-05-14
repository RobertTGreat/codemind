import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TypeScriptWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

type MonacoWorkerLabel = "css" | "scss" | "less" | "html" | "handlebars" | "razor" | "json" | "typescript" | "javascript";

export function configureMonacoEnvironment() {
  globalThis.MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) => createMonacoWorker(label),
  };

  loader.config({ monaco });
}

function createMonacoWorker(label: string): Worker {
  const workerLabel = label as MonacoWorkerLabel;

  if (workerLabel === "json") {
    return new JsonWorker();
  }

  if (workerLabel === "css" || workerLabel === "scss" || workerLabel === "less") {
    return new CssWorker();
  }

  if (workerLabel === "html" || workerLabel === "handlebars" || workerLabel === "razor") {
    return new HtmlWorker();
  }

  if (workerLabel === "typescript" || workerLabel === "javascript") {
    return new TypeScriptWorker();
  }

  return new EditorWorker();
}
