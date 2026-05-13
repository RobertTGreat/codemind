import type * as monaco from "monaco-editor";
import { Registry, type IRawGrammar, type StateStack } from "vscode-textmate";
import {
  createOnigScanner,
  createOnigString,
  loadWASM,
} from "vscode-oniguruma";
import onigurumaWasmUrl from "vscode-oniguruma/release/onig.wasm?url";
import { grammars, injections } from "tm-grammars";
import { editorLanguageDefinitions } from "./editorLanguageRegistry";

type MonacoNamespace = typeof monaco;

type GrammarModule = {
  default: unknown;
};

type GrammarLoader = () => Promise<GrammarModule>;

const textMateThemeName = "codemind-vscode-dark";
const tokenizationTimeLimitInMilliseconds = 20;

const grammarModuleLoaders = import.meta.glob<GrammarModule>(
  "/node_modules/tm-grammars/grammars/*.json",
);
const grammarNameByScopeName = createGrammarNameByScopeName();
const textMateScopeByMonacoLanguage = createTextMateScopeByMonacoLanguage();

let registryPromise: Promise<Registry> | null = null;
let isTextMateHighlightingRegistered = false;
const registeredProviderLanguageIds = new Set<string>();

export function configureTextMateHighlighting(monacoInstance: MonacoNamespace) {
  registerTextMateLanguages(monacoInstance);
  defineTextMateTheme(monacoInstance);

  if (isTextMateHighlightingRegistered) {
    return;
  }

  isTextMateHighlightingRegistered = true;
}

export function getTextMateThemeName(): string {
  return textMateThemeName;
}

export function ensureTextMateLanguage(
  monacoInstance: MonacoNamespace,
  languageId: string,
): Promise<boolean> {
  const scopeName = textMateScopeByMonacoLanguage.get(languageId);
  if (!scopeName) {
    return Promise.resolve(false);
  }

  if (!registeredProviderLanguageIds.has(languageId)) {
    registeredProviderLanguageIds.add(languageId);
    monacoInstance.languages.setTokensProvider(
      languageId,
      createTextMateTokensProvider(scopeName),
    );
  }

  return Promise.resolve(true);
}

function createTextMateTokensProvider(
  defaultScopeName: string,
): Promise<monaco.languages.TokensProvider> {
  return getTextMateRegistry().then(async (registry) => {
    const defaultGrammar = await registry.loadGrammar(defaultScopeName);
    return {
      getInitialState: () => new TextMateTokenizationState(null, defaultScopeName),
      tokenize: (line: string, state: monaco.languages.IState) => {
        const textMateState =
          state instanceof TextMateTokenizationState
            ? state
            : new TextMateTokenizationState(null, defaultScopeName);
        const grammar = defaultGrammar;

        if (!grammar) {
          return {
            tokens: [{ startIndex: 0, scopes: defaultScopeName }],
            endState: textMateState,
          };
        }

        const tokenizedLine = grammar.tokenizeLine(
          line,
          textMateState.ruleStack,
          tokenizationTimeLimitInMilliseconds,
        );

        return {
          tokens: tokenizedLine.tokens.map((token) => ({
            startIndex: token.startIndex,
            scopes: getMostSpecificTokenScope(token.scopes),
          })),
          endState: new TextMateTokenizationState(
            tokenizedLine.ruleStack,
            textMateState.scopeName,
          ),
        };
      },
    };
  });
}

function getTextMateRegistry(): Promise<Registry> {
  registryPromise ??= createTextMateRegistry();
  return registryPromise;
}

async function createTextMateRegistry(): Promise<Registry> {
  await loadWASM(await fetch(onigurumaWasmUrl));

  return new Registry({
    onigLib: Promise.resolve({
      createOnigScanner,
      createOnigString,
    }),
    loadGrammar: async (scopeName) => {
      const grammarName = grammarNameByScopeName[scopeName];
      const grammarLoader = grammarName ? getGrammarLoader(grammarName) : undefined;
      if (!grammarLoader) {
        return null;
      }

      const grammarModule = await grammarLoader();
      return grammarModule.default as IRawGrammar;
    },
  });
}

class TextMateTokenizationState implements monaco.languages.IState {
  constructor(
    readonly ruleStack: StateStack | null,
    readonly scopeName: string,
  ) {}

  clone(): TextMateTokenizationState {
    return new TextMateTokenizationState(this.ruleStack?.clone() ?? null, this.scopeName);
  }

  equals(other: monaco.languages.IState): boolean {
    return (
      other instanceof TextMateTokenizationState &&
      other.scopeName === this.scopeName &&
      (this.ruleStack === other.ruleStack ||
        Boolean(this.ruleStack?.equals(other.ruleStack as StateStack)))
    );
  }
}

function getMostSpecificTokenScope(scopes: string[]): string {
  return scopes[scopes.length - 1] ?? "source";
}

function defineTextMateTheme(monacoInstance: MonacoNamespace) {
  monacoInstance.editor.defineTheme(textMateThemeName, {
    base: "vs-dark",
    inherit: true,
    colors: {
      "editor.background": "#121212",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#5a5a5a",
      "editorLineNumber.activeForeground": "#c6c6c6",
      "editor.selectionBackground": "#264f78",
      "editor.inactiveSelectionBackground": "#3a3d41",
      "editorCursor.foreground": "#e8e8e8",
    },
    rules: [
      { token: "comment", foreground: "6a9955", fontStyle: "italic" },
      { token: "constant", foreground: "4fc1ff" },
      { token: "constant.character.escape", foreground: "d7ba7d" },
      { token: "constant.language", foreground: "569cd6" },
      { token: "constant.numeric", foreground: "b5cea8" },
      { token: "entity.name.class", foreground: "4ec9b0" },
      { token: "entity.name.function", foreground: "dcdcaa" },
      { token: "entity.name.tag", foreground: "569cd6" },
      { token: "entity.other.attribute-name", foreground: "9cdcfe" },
      { token: "invalid", foreground: "f44747" },
      { token: "keyword", foreground: "c586c0" },
      { token: "keyword.control", foreground: "c586c0" },
      { token: "keyword.operator", foreground: "d4d4d4" },
      { token: "markup.bold", foreground: "d7ba7d", fontStyle: "bold" },
      { token: "markup.heading", foreground: "569cd6", fontStyle: "bold" },
      { token: "markup.inline.raw", foreground: "ce9178" },
      { token: "markup.italic", foreground: "d7ba7d", fontStyle: "italic" },
      { token: "markup.quote", foreground: "6a9955" },
      { token: "markup.underline.link", foreground: "3794ff" },
      { token: "meta.object-literal.key", foreground: "9cdcfe" },
      { token: "punctuation.definition.string", foreground: "ce9178" },
      { token: "storage", foreground: "569cd6" },
      { token: "storage.type", foreground: "569cd6" },
      { token: "string", foreground: "ce9178" },
      { token: "string.quoted.docstring", foreground: "6a9955" },
      { token: "support.class", foreground: "4ec9b0" },
      { token: "support.constant", foreground: "4fc1ff" },
      { token: "support.function", foreground: "dcdcaa" },
      { token: "support.type", foreground: "4ec9b0" },
      { token: "support.variable", foreground: "9cdcfe" },
      { token: "variable.language", foreground: "569cd6" },
      { token: "variable.other.constant", foreground: "4fc1ff" },
      { token: "variable.parameter", foreground: "9cdcfe" },
    ],
  });
}

function registerTextMateLanguages(_monacoInstance: MonacoNamespace) {
  return;
}

function createGrammarNameByScopeName(): Record<string, string> {
  return Object.fromEntries(
    [...grammars, ...injections].map((grammar) => [grammar.scopeName, grammar.name]),
  );
}

function createTextMateScopeByMonacoLanguage(): Map<string, string> {
  const scopeByGrammarName = new Map(
    grammars.map((grammar) => [grammar.name, grammar.scopeName]),
  );
  return new Map(
    editorLanguageDefinitions.flatMap((definition) => {
      const scopeName = scopeByGrammarName.get(definition.grammarName) ?? definition.scopeName;
      return scopeName ? [[definition.languageId, scopeName] as const] : [];
    }),
  );
}

function getGrammarLoader(grammarName: string): GrammarLoader | undefined {
  return grammarModuleLoaders[
    `/node_modules/tm-grammars/grammars/${grammarName}.json`
  ];
}
