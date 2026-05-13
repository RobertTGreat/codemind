export interface EditorLanguageDefinition {
  languageId: string;
  grammarName: string;
  scopeName: string;
  aliases: string[];
  extensions: string[];
  filenames?: string[];
}

export const editorLanguageDefinitions: EditorLanguageDefinition[] = [
  language("abap", "abap", "source.abap", [".abap"]),
  language("actionscript-3", "actionscript-3", "source.actionscript.3", [".as"]),
  language("ada", "ada", "source.ada", [".ada", ".adb", ".ads"]),
  language("angular-html", "angular-html", "text.html.derivative.ng", [
    ".component.html",
    ".ng.html",
  ]),
  language("angular-ts", "angular-ts", "source.ts.ng", [
    ".component.ts",
    ".directive.ts",
    ".pipe.ts",
  ]),
  language("apache", "apache", "source.apacheconf", [".apacheconf", ".htaccess"]),
  language("apex", "apex", "source.apex", [".apex", ".cls", ".trigger"]),
  language("apl", "apl", "source.apl", [".apl"]),
  language("applescript", "applescript", "source.applescript", [".applescript", ".scpt"]),
  language("ara", "ara", "source.ara", [".ara"]),
  language("asciidoc", "asciidoc", "text.html.asciidoc", [".adoc", ".asciidoc"]),
  language("asm", "asm", "source.asm.x86_64", [".asm", ".s", ".S"]),
  language("astro", "astro", "source.astro", [".astro"]),
  language("awk", "awk", "source.awk", [".awk"]),
  language("ballerina", "ballerina", "source.ballerina", [".bal"]),
  language("bat", "bat", "source.batchfile", [".bat", ".cmd"]),
  language("beancount", "beancount", "source.beancount", [".beancount"]),
  language("berry", "berry", "source.berry", [".be", ".berry"]),
  language("bibtex", "bibtex", "text.bibtex", [".bib"]),
  language("bicep", "bicep", "source.bicep", [".bicep"]),
  language("bird2", "bird2", "source.bird2", [".bird", ".bird2"]),
  language("blade", "blade", "text.html.php.blade", [".blade.php"]),
  language("bsl", "bsl", "source.bsl", [".bsl", ".os"]),
  language("c", "c", "source.c", [".c", ".h"]),
  language("c3", "c3", "source.c3", [".c3"]),
  language("cadence", "cadence", "source.cadence", [".cdc"]),
  language("cairo", "cairo", "source.cairo", [".cairo"]),
  language("clarity", "clarity", "source.clar", [".clar"]),
  language("clojure", "clojure", "source.clojure", [".clj", ".cljs", ".cljc", ".edn"]),
  language("cmake", "cmake", "source.cmake", [".cmake"], ["CMakeLists.txt"]),
  language("cobol", "cobol", "source.cobol", [".cob", ".cbl", ".cobol"]),
  language("codeowners", "codeowners", "text.codeowners", [], ["CODEOWNERS"]),
  language("codeql", "codeql", "source.ql", [".ql", ".qll"]),
  language("coffee", "coffee", "source.coffee", [".coffee"]),
  language("common-lisp", "common-lisp", "source.commonlisp", [".lisp", ".lsp", ".cl"]),
  language("coq", "coq", "source.coq", [".coq"]),
  language("cpp", "cpp", "source.cpp", [".cpp", ".cxx", ".cc", ".hpp", ".hxx", ".hh"]),
  language("crystal", "crystal", "source.crystal", [".cr"]),
  language("csharp", "csharp", "source.cs", [".cs", ".csx"]),
  language("css", "css", "source.css", [".css"]),
  language("csv", "csv", "text.csv", [".csv"]),
  language("cue", "cue", "source.cue", [".cue"]),
  language("cypher", "cypher", "source.cypher", [".cypher", ".cql"]),
  language("d", "d", "source.d", [".d"]),
  language("dart", "dart", "source.dart", [".dart"]),
  language("dax", "dax", "source.dax", [".dax"]),
  language("desktop", "desktop", "source.desktop", [".desktop"]),
  language("diff", "diff", "source.diff", [".diff", ".patch"]),
  language("docker", "docker", "source.dockerfile", [".dockerfile"], ["Dockerfile", "Containerfile"]),
  language("dotenv", "dotenv", "source.env", [".env"]),
  language("dream-maker", "dream-maker", "source.dm", [".dm", ".dme", ".dmm"]),
  language("edge", "edge", "text.html.edge", [".edge"]),
  language("elixir", "elixir", "source.elixir", [".ex", ".exs"]),
  language("elm", "elm", "source.elm", [".elm"]),
  language("emacs-lisp", "emacs-lisp", "source.emacs.lisp", [".el"]),
  language("erb", "erb", "text.html.erb", [".erb", ".html.erb"]),
  language("erlang", "erlang", "source.erlang", [".erl", ".hrl"]),
  language("fennel", "fennel", "source.fennel", [".fnl"]),
  language("fish", "fish", "source.fish", [".fish"]),
  language("fluent", "fluent", "source.ftl", [".ftl"]),
  language("fortran-free-form", "fortran-free-form", "source.fortran.modern", [
    ".f90",
    ".f95",
    ".f03",
    ".f08",
  ]),
  language("fortran-fixed-form", "fortran-fixed-form", "source.fortran.fixed", [
    ".f",
    ".for",
    ".f77",
  ]),
  language("fsharp", "fsharp", "source.fsharp", [".fs", ".fsi", ".fsx"]),
  language("gdresource", "gdresource", "source.gdresource", [".tscn", ".tres"]),
  language("gdscript", "gdscript", "source.gdscript", [".gd"]),
  language("gdshader", "gdshader", "source.gdshader", [".gdshader"]),
  language("genie", "genie", "source.genie", [".gs"]),
  language("gherkin", "gherkin", "text.gherkin.feature", [".feature"]),
  language("git-commit", "git-commit", "text.git-commit", [], ["COMMIT_EDITMSG", "MERGE_MSG"]),
  language("git-rebase", "git-rebase", "text.git-rebase", [], ["git-rebase-todo"]),
  language("gleam", "gleam", "source.gleam", [".gleam"]),
  language("glimmer-js", "glimmer-js", "source.gjs", [".gjs"]),
  language("glimmer-ts", "glimmer-ts", "source.gts", [".gts"]),
  language("glsl", "glsl", "source.glsl", [
    ".glsl",
    ".vert",
    ".frag",
    ".geom",
    ".tesc",
    ".tese",
    ".comp",
  ]),
  language("gn", "gn", "source.gn", [".gn", ".gni"]),
  language("gnuplot", "gnuplot", "source.gnuplot", [".gnuplot", ".gp"]),
  language("go", "go", "source.go", [".go"]),
  language("graphql", "graphql", "source.graphql", [".graphql", ".gql"]),
  language("groovy", "groovy", "source.groovy", [".groovy", ".gradle"]),
  language("hack", "hack", "source.hack", [".hack"]),
  language("haml", "haml", "text.haml", [".haml"]),
  language("handlebars", "handlebars", "text.html.handlebars", [
    ".hbs",
    ".handlebars",
    ".mustache",
  ]),
  language("haskell", "haskell", "source.haskell", [".hs", ".lhs"]),
  language("haxe", "haxe", "source.hx", [".hx"]),
  language("hcl", "hcl", "source.hcl", [".hcl"]),
  language("hjson", "hjson", "source.hjson", [".hjson"]),
  language("hlsl", "hlsl", "source.hlsl", [".hlsl", ".fx", ".fxh"]),
  language("html", "html", "text.html.basic", [".html", ".htm", ".xhtml"]),
  language("html-derivative", "html-derivative", "text.html.derivative", []),
  language("http", "http", "source.http", [".http", ".rest"]),
  language("hurl", "hurl", "source.hurl", [".hurl"]),
  language("hxml", "hxml", "source.hxml", [".hxml"]),
  language("hy", "hy", "source.hy", [".hy"]),
  language("imba", "imba", "source.imba", [".imba"]),
  language("ini", "ini", "source.ini", [".ini", ".cfg", ".conf", ".properties"]),
  language("java", "java", "source.java", [".java"]),
  language("javascript", "javascript", "source.js", [".js", ".mjs", ".cjs"]),
  language("javascriptreact", "jsx", "source.js.jsx", [".jsx"]),
  language("jinja", "jinja", "text.html.jinja", [".jinja", ".jinja2", ".j2"]),
  language("jison", "jison", "source.jison", [".jison", ".jisonlex"]),
  language("json", "json", "source.json", [".json"]),
  language("json5", "json5", "source.json5", [".json5"]),
  language("jsonc", "jsonc", "source.json.comments", [".jsonc"]),
  language("jsonl", "jsonl", "source.json.lines", [".jsonl", ".ndjson"]),
  language("jsonnet", "jsonnet", "source.jsonnet", [".jsonnet", ".libsonnet"]),
  language("jssm", "jssm", "source.jssm", [".jssm", ".fsl"]),
  language("julia", "julia", "source.julia", [".jl"]),
  language("just", "just", "source.just", [".just"], ["justfile", "Justfile"]),
  language("kdl", "kdl", "source.kdl", [".kdl"]),
  language("kotlin", "kotlin", "source.kotlin", [".kt", ".kts"]),
  language("kusto", "kusto", "source.kusto", [".kql", ".csl"]),
  language("latex", "latex", "text.tex.latex", [".tex", ".sty", ".cls"]),
  language("lean", "lean", "source.lean", [".lean"]),
  language("less", "less", "source.css.less", [".less"]),
  language("liquid", "liquid", "text.html.liquid", [".liquid"]),
  language("llvm", "llvm", "source.llvm", [".ll"]),
  language("log", "log", "text.log", [".log"]),
  language("logo", "logo", "source.logo", [".logo", ".lgo"]),
  language("lua", "lua", "source.lua", [".lua"]),
  language("luau", "luau", "source.luau", [".luau"]),
  language("make", "make", "source.makefile", [".mk", ".mak"], ["Makefile", "makefile"]),
  language("markdown", "markdown", "text.html.markdown", [".md", ".markdown", ".mdown"]),
  language("marko", "marko", "text.marko", [".marko"]),
  language("matlab", "matlab", "source.matlab", [".m"]),
  language("mdc", "mdc", "text.markdown.mdc", [".mdc"]),
  language("mdx", "mdx", "source.mdx", [".mdx"]),
  language("mermaid", "mermaid", "source.mermaid", [".mmd", ".mermaid"]),
  language("mipsasm", "mipsasm", "source.mips", [".mips", ".mipsasm"]),
  language("mojo", "mojo", "source.mojo", [".mojo"]),
  language("moonbit", "moonbit", "source.moonbit", [".mbt"]),
  language("move", "move", "source.move", [".move"]),
  language("narrat", "narrat", "source.narrat", [".narrat"]),
  language("nextflow", "nextflow", "source.nextflow", [".nf"]),
  language("nextflow-groovy", "nextflow-groovy", "source.nextflow-groovy", [], [
    "nextflow.config",
  ]),
  language("nginx", "nginx", "source.nginx", [".nginx", ".nginxconf"]),
  language("nim", "nim", "source.nim", [".nim", ".nims"]),
  language("nix", "nix", "source.nix", [".nix"]),
  language("nushell", "nushell", "source.nushell", [".nu"]),
  language("objective-c", "objective-c", "source.objc", [".m", ".mm"]),
  language("objective-cpp", "objective-cpp", "source.objcpp", [".mm"]),
  language("ocaml", "ocaml", "source.ocaml", [".ml", ".mli"]),
  language("odin", "odin", "source.odin", [".odin"]),
  language("openscad", "openscad", "source.scad", [".scad"]),
  language("pascal", "pascal", "source.pascal", [".pas", ".pp", ".inc"]),
  language("perl", "perl", "source.perl", [".pl", ".pm", ".pod"]),
  language("php", "php", "source.php", [".php", ".phtml"]),
  language("pkl", "pkl", "source.pkl", [".pkl"]),
  language("plsql", "plsql", "source.plsql", [".pls", ".pks", ".pkb"]),
  language("po", "po", "source.po", [".po", ".pot"]),
  language("polar", "polar", "source.polar", [".polar"]),
  language("postcss", "postcss", "source.css.postcss", [".pcss", ".postcss"]),
  language("powerquery", "powerquery", "source.powerquery", [".pq", ".pqm"]),
  language("powershell", "powershell", "source.powershell", [".ps1", ".psm1", ".psd1"]),
  language("prisma", "prisma", "source.prisma", [".prisma"]),
  language("prolog", "prolog", "source.prolog", [".pro", ".prolog"]),
  language("proto", "proto", "source.proto", [".proto"]),
  language("pug", "pug", "text.pug", [".pug", ".jade"]),
  language("puppet", "puppet", "source.puppet", [".pp"]),
  language("purescript", "purescript", "source.purescript", [".purs"]),
  language("python", "python", "source.python", [".py", ".pyw", ".pyi"]),
  language("qml", "qml", "source.qml", [".qml"]),
  language("qmldir", "qmldir", "source.qmldir", [".qmldir"], ["qmldir"]),
  language("qss", "qss", "source.qss", [".qss"]),
  language("r", "r", "source.r", [".r", ".R", ".rmd", ".Rmd"]),
  language("racket", "racket", "source.racket", [".rkt"]),
  language("raku", "raku", "source.raku", [".raku", ".rakumod", ".p6", ".pm6"]),
  language("razor", "razor", "text.html.cshtml", [".cshtml", ".razor"]),
  language("reg", "reg", "source.reg", [".reg"]),
  language("regexp", "regexp", "source.regexp", [".regex", ".regexp"]),
  language("rel", "rel", "source.rel", [".rel"]),
  language("riscv", "riscv", "source.riscv", [".riscv"]),
  language("ron", "ron", "source.ron", [".ron"]),
  language("rosmsg", "rosmsg", "source.rosmsg", [".msg", ".srv", ".action"]),
  language("rst", "rst", "source.rst", [".rst"]),
  language("ruby", "ruby", "source.ruby", [".rb", ".rake", ".gemspec"], ["Gemfile", "Rakefile"]),
  language("rust", "rust", "source.rust", [".rs"]),
  language("sas", "sas", "source.sas", [".sas"]),
  language("sass", "sass", "source.sass", [".sass"]),
  language("scala", "scala", "source.scala", [".scala", ".sc"]),
  language("scheme", "scheme", "source.scheme", [".scm", ".ss"]),
  language("scss", "scss", "source.css.scss", [".scss"]),
  language("sdbl", "sdbl", "source.sdbl", [".sdbl"]),
  language("shaderlab", "shaderlab", "source.shaderlab", [".shader"]),
  language("shellscript", "shellscript", "source.shell", [".sh", ".bash", ".zsh", ".ksh"]),
  language("shellsession", "shellsession", "text.shell-session", [".sh-session"]),
  language("smalltalk", "smalltalk", "source.smalltalk", [".st"]),
  language("solidity", "solidity", "source.solidity", [".sol"]),
  language("soy", "soy", "text.html.soy", [".soy"]),
  language("sparql", "sparql", "source.sparql", [".rq", ".sparql"]),
  language("splunk", "splunk", "source.splunk_search", [".spl", ".splunk"]),
  language("sql", "sql", "source.sql", [".sql"]),
  language("ssh-config", "ssh-config", "source.ssh-config", [], [
    "ssh_config",
    "sshd_config",
  ]),
  language("stata", "stata", "source.stata", [".do", ".ado"]),
  language("stylus", "stylus", "source.stylus", [".styl"]),
  language("surrealql", "surrealql", "source.surrealql", [".surql", ".surrealql"]),
  language("svelte", "svelte", "source.svelte", [".svelte"]),
  language("swift", "swift", "source.swift", [".swift"]),
  language("system-verilog", "system-verilog", "source.systemverilog", [".sv", ".svh"]),
  language("systemd", "systemd", "source.systemd", [".service", ".timer", ".socket"]),
  language("talonscript", "talonscript", "source.talon", [".talon"]),
  language("tasl", "tasl", "source.tasl", [".tasl"]),
  language("tcl", "tcl", "source.tcl", [".tcl"]),
  language("templ", "templ", "source.templ", [".templ"]),
  language("terraform", "terraform", "source.terraform", [".tf", ".tfvars"]),
  language("tex", "tex", "text.tex", [".tex"]),
  language("toml", "toml", "source.toml", [".toml"]),
  language("tsv", "tsv", "text.tsv", [".tsv"]),
  language("ts-tags", "ts-tags", "source.ts.tags", []),
  language("turtle", "turtle", "source.turtle", [".ttl", ".turtle"]),
  language("twig", "twig", "text.html.twig", [".twig"]),
  language("typescript", "typescript", "source.ts", [".ts", ".mts", ".cts"]),
  language("typescriptreact", "tsx", "source.tsx", [".tsx"]),
  language("typespec", "typespec", "source.tsp", [".tsp"]),
  language("typst", "typst", "source.typst", [".typ"]),
  language("v", "v", "source.v", [".v"]),
  language("vala", "vala", "source.vala", [".vala", ".vapi"]),
  language("vb", "vb", "source.asp.vb.net", [".vb", ".vbs"]),
  language("verilog", "verilog", "source.verilog", [".v", ".vh"]),
  language("vhdl", "vhdl", "source.vhdl", [".vhd", ".vhdl"]),
  language("viml", "viml", "source.viml", [".vim", ".vimrc"], [".vimrc"]),
  language("vue", "vue", "source.vue", [".vue"]),
  language("vue-html", "vue-html", "text.html.vue-html", []),
  language("vue-vine", "vue-vine", "source.vue-vine", [".vine.ts", ".vine.tsx"]),
  language("vyper", "vyper", "source.vyper", [".vy"]),
  language("wasm", "wasm", "source.wat", [".wat", ".wasm"]),
  language("wenyan", "wenyan", "source.wenyan", [".wy"]),
  language("wgsl", "wgsl", "source.wgsl", [".wgsl"]),
  language("wikitext", "wikitext", "text.html.mediawiki", [".wiki", ".wikitext"]),
  language("wit", "wit", "source.wit", [".wit"]),
  language("wolfram", "wolfram", "source.wolfram", [".wl", ".wls", ".nb"]),
  language("xml", "xml", "text.xml", [".xml", ".svg", ".xaml", ".plist"]),
  language("xsl", "xsl", "text.xml.xsl", [".xsl", ".xslt"]),
  language("yaml", "yaml", "source.yaml", [".yaml", ".yml"]),
  language("zenscript", "zenscript", "source.zenscript", [".zs"]),
  language("zig", "zig", "source.zig", [".zig", ".zon"]),
];

const languageIdByExtension = createExtensionLanguageMap(editorLanguageDefinitions);
const languageIdByFilename = createFilenameLanguageMap(editorLanguageDefinitions);
const languageIdByGrammarName = new Map(
  editorLanguageDefinitions.map((definition) => [
    definition.grammarName,
    definition.languageId,
  ]),
);
const knownLanguageIds = new Set(
  editorLanguageDefinitions.map((definition) => definition.languageId),
);
const commonLanguageIds = new Set([
  "css",
  "html",
  "javascript",
  "javascriptreact",
  "json",
  "markdown",
  "plaintext",
  "rust",
  "toml",
  "typescript",
  "typescriptreact",
  "yaml",
]);

export function getEditorLanguageId(
  selectedFilePath: string | null,
  detectedLanguage: string | undefined,
): string {
  const normalizedDetectedLanguage = normalizeDetectedLanguage(detectedLanguage);
  if (normalizedDetectedLanguage && normalizedDetectedLanguage !== "plaintext") {
    return normalizedDetectedLanguage;
  }

  const normalizedPath = selectedFilePath?.replace(/\\/g, "/");
  const fileName = normalizedPath?.split("/").pop();
  const specialFileLanguage = getSpecialFileLanguage(normalizedPath, fileName);
  if (specialFileLanguage) {
    return specialFileLanguage;
  }

  const fileNameLanguage = fileName
    ? languageIdByFilename.get(fileName.toLowerCase())
    : undefined;
  if (fileNameLanguage) {
    return fileNameLanguage;
  }

  const extensionLanguage = getExtensionCandidates(fileName).find((extension) => {
    return languageIdByExtension.has(extension);
  });

  return extensionLanguage ? languageIdByExtension.get(extensionLanguage)! : "plaintext";
}

export function registerEditorLanguages(monaco: {
  languages: {
    getLanguages(): Array<{ id: string }>;
    register(language: {
      id: string;
      aliases?: string[];
      extensions?: string[];
      filenames?: string[];
    }): void;
  };
}) {
  registerEditorLanguageDefinitions(
    monaco,
    editorLanguageDefinitions.filter((definition) =>
      commonLanguageIds.has(definition.languageId),
    ),
  );
}

export function registerEditorLanguage(
  monaco: {
    languages: {
      getLanguages(): Array<{ id: string }>;
      register(language: {
        id: string;
        aliases?: string[];
        extensions?: string[];
        filenames?: string[];
      }): void;
    };
  },
  languageId: string,
) {
  const languageDefinition = editorLanguageDefinitions.find(
    (definition) => definition.languageId === languageId,
  );
  if (!languageDefinition) {
    return;
  }

  registerEditorLanguageDefinitions(monaco, [languageDefinition]);
}

function registerEditorLanguageDefinitions(
  monaco: {
    languages: {
      getLanguages(): Array<{ id: string }>;
      register(language: {
        id: string;
        aliases?: string[];
        extensions?: string[];
        filenames?: string[];
      }): void;
    };
  },
  languageDefinitions: EditorLanguageDefinition[],
) {
  const registeredLanguageIds = new Set(
    monaco.languages.getLanguages().map((registeredLanguage) => registeredLanguage.id),
  );

  for (const definition of languageDefinitions) {
    if (registeredLanguageIds.has(definition.languageId)) {
      continue;
    }

    monaco.languages.register({
      id: definition.languageId,
      aliases: definition.aliases,
      extensions: definition.extensions,
      filenames: definition.filenames,
    });
  }
}

function language(
  languageId: string,
  grammarName: string,
  scopeName: string,
  extensions: string[],
  filenames: string[] = [],
): EditorLanguageDefinition {
  return {
    languageId,
    grammarName,
    scopeName,
    aliases: createAliases(languageId, grammarName),
    extensions,
    filenames,
  };
}

function createAliases(languageId: string, grammarName: string): string[] {
  return Array.from(
    new Set([
      languageId,
      grammarName,
      titleCase(languageId.replace(/-/g, " ")),
      titleCase(grammarName.replace(/-/g, " ")),
    ]),
  );
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function createExtensionLanguageMap(definitions: EditorLanguageDefinition[]) {
  const languageByExtension = new Map<string, string>();

  for (const definition of definitions) {
    for (const extension of definition.extensions) {
      languageByExtension.set(extension.toLowerCase(), definition.languageId);
    }
  }

  return languageByExtension;
}

function createFilenameLanguageMap(definitions: EditorLanguageDefinition[]) {
  const languageByFilename = new Map<string, string>();

  for (const definition of definitions) {
    for (const fileName of definition.filenames ?? []) {
      languageByFilename.set(fileName.toLowerCase(), definition.languageId);
    }
  }

  return languageByFilename;
}

function normalizeDetectedLanguage(detectedLanguage: string | undefined): string | null {
  if (!detectedLanguage) {
    return null;
  }

  const normalizedLanguage = detectedLanguage.toLowerCase();
  if (normalizedLanguage === "plaintext") {
    return "plaintext";
  }

  if (knownLanguageIds.has(normalizedLanguage)) {
    return normalizedLanguage;
  }

  return languageIdByGrammarName.get(normalizedLanguage) ?? null;
}

function getSpecialFileLanguage(
  normalizedPath: string | undefined,
  fileName: string | undefined,
): string | null {
  if (!fileName) {
    return null;
  }

  const lowerCaseFileName = fileName.toLowerCase();
  const lowerCasePath = normalizedPath?.toLowerCase() ?? "";

  if (lowerCaseFileName.startsWith(".env")) {
    return "dotenv";
  }

  if (
    lowerCaseFileName === "config" &&
    (lowerCasePath.includes("/.ssh/") || lowerCasePath.includes("/ssh/"))
  ) {
    return "ssh-config";
  }

  if (
    lowerCaseFileName.startsWith("dockerfile.") ||
    lowerCaseFileName.startsWith("containerfile.")
  ) {
    return "docker";
  }

  if (lowerCaseFileName.startsWith("makefile.")) {
    return "make";
  }

  return null;
}

function getExtensionCandidates(fileName: string | undefined): string[] {
  if (!fileName) {
    return [];
  }

  const lowerCaseFileName = fileName.toLowerCase();
  const fileNameParts = lowerCaseFileName.split(".");
  if (fileNameParts.length < 2) {
    return [];
  }

  const candidates: string[] = [];
  for (let extensionStartIndex = 1; extensionStartIndex < fileNameParts.length; extensionStartIndex += 1) {
    candidates.push(`.${fileNameParts.slice(extensionStartIndex).join(".")}`);
  }

  return candidates.sort((leftExtension, rightExtension) => {
    return rightExtension.length - leftExtension.length;
  });
}
