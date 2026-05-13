export interface VscodeCompatibilityPreset {
  id: string;
  name: string;
  category: "language" | "framework" | "tooling";
  description: string;
  extensionIds: string[];
  settings: Record<string, unknown>;
}

export const vscodeCompatibilityPresets: VscodeCompatibilityPreset[] = [
  {
    id: "typescript",
    name: "TypeScript / JavaScript",
    category: "language",
    description: "Core JS/TS formatting and linting.",
    extensionIds: ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"],
    settings: {
      "[javascript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "[javascriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "[typescriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "editor.codeActionsOnSave": {
        "source.fixAll.eslint": "explicit",
      },
    },
  },
  {
    id: "rust",
    name: "Rust",
    category: "language",
    description: "Rust Analyzer and TOML support.",
    extensionIds: ["rust-lang.rust-analyzer", "tamasfe.even-better-toml"],
    settings: {
      "[rust]": { "editor.defaultFormatter": "rust-lang.rust-analyzer" },
      "[toml]": { "editor.defaultFormatter": "tamasfe.even-better-toml" },
    },
  },
  {
    id: "python",
    name: "Python",
    category: "language",
    description: "Python language tools with Black formatting.",
    extensionIds: ["ms-python.python", "ms-python.black-formatter"],
    settings: {
      "[python]": { "editor.defaultFormatter": "ms-python.black-formatter" },
      "python.analysis.typeCheckingMode": "basic",
    },
  },
  {
    id: "go",
    name: "Go",
    category: "language",
    description: "Go language server and formatter integration.",
    extensionIds: ["golang.go"],
    settings: {
      "[go]": { "editor.defaultFormatter": "golang.go" },
      "go.formatTool": "gofmt",
    },
  },
  {
    id: "react-next",
    name: "React / Next.js",
    category: "framework",
    description: "React projects with ESLint and Prettier.",
    extensionIds: ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"],
    settings: {
      "eslint.validate": [
        "javascript",
        "javascriptreact",
        "typescript",
        "typescriptreact",
      ],
    },
  },
  {
    id: "vue",
    name: "Vue",
    category: "framework",
    description: "Vue language features and formatting.",
    extensionIds: ["Vue.volar", "esbenp.prettier-vscode"],
    settings: {
      "[vue]": { "editor.defaultFormatter": "Vue.volar" },
    },
  },
  {
    id: "svelte",
    name: "Svelte",
    category: "framework",
    description: "Svelte language features and formatting.",
    extensionIds: ["svelte.svelte-vscode", "esbenp.prettier-vscode"],
    settings: {
      "[svelte]": { "editor.defaultFormatter": "svelte.svelte-vscode" },
    },
  },
  {
    id: "astro",
    name: "Astro",
    category: "framework",
    description: "Astro component language support.",
    extensionIds: ["astro-build.astro-vscode", "esbenp.prettier-vscode"],
    settings: {
      "[astro]": { "editor.defaultFormatter": "astro-build.astro-vscode" },
    },
  },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    category: "framework",
    description: "Tailwind class completions and CSS formatting.",
    extensionIds: ["bradlc.vscode-tailwindcss", "esbenp.prettier-vscode"],
    settings: {
      "[css]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "[scss]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "[postcss]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
    },
  },
  {
    id: "data-config",
    name: "JSON / YAML",
    category: "tooling",
    description: "Common config-file formatting and YAML language support.",
    extensionIds: ["redhat.vscode-yaml", "esbenp.prettier-vscode"],
    settings: {
      "[json]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "[jsonc]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
      "[yaml]": { "editor.defaultFormatter": "redhat.vscode-yaml" },
    },
  },
  {
    id: "prisma",
    name: "Prisma",
    category: "tooling",
    description: "Prisma schema support.",
    extensionIds: ["Prisma.prisma"],
    settings: {
      "[prisma]": { "editor.defaultFormatter": "Prisma.prisma" },
    },
  },
];

export function createVscodeCompatibilityFiles(presetIds: string[]) {
  const selectedPresets = vscodeCompatibilityPresets.filter((preset) =>
    presetIds.includes(preset.id),
  );
  const recommendations = Array.from(
    new Set(selectedPresets.flatMap((preset) => preset.extensionIds)),
  ).sort();
  const settings = selectedPresets.reduce<Record<string, unknown>>(
    (combinedSettings, preset) => deepMergeSettings(combinedSettings, preset.settings),
    {},
  );

  return {
    extensionsJson: formatJson({ recommendations }),
    settingsJson: formatJson(settings),
  };
}

function deepMergeSettings(
  leftSettings: Record<string, unknown>,
  rightSettings: Record<string, unknown>,
): Record<string, unknown> {
  const mergedSettings = { ...leftSettings };

  for (const [settingKey, settingValue] of Object.entries(rightSettings)) {
    const existingValue = mergedSettings[settingKey];
    if (isPlainObject(existingValue) && isPlainObject(settingValue)) {
      mergedSettings[settingKey] = deepMergeSettings(existingValue, settingValue);
      continue;
    }

    mergedSettings[settingKey] = settingValue;
  }

  return mergedSettings;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
