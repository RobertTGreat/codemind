import { Check, Copy, Settings, X } from "lucide-react";
import {
  agentMcpToolUsage,
  agentProviders,
  copilotKitMcpServerUrl,
  projectMcpToolUsage,
} from "../../../domain/models/agent";
import {
  createVscodeCompatibilityFiles,
  vscodeCompatibilityPresets,
} from "../../../domain/models/vscodeCompatibility";
import { useWorkspaceStore } from "../../../stores/workspaceStore";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { Button } from "../../components/button/Button";
import { Badge } from "../../components/badge/Badge";
import { useState } from "react";
import { cn } from "../../lib/classNames";

interface SettingsDialogProps {
  isOpen: boolean;
  selectedProjectRoot: string | null;
  onClose: () => void;
}

export function SettingsDialog({
  isOpen,
  selectedProjectRoot,
  onClose,
}: SettingsDialogProps) {
  const visibleSections = useWorkspaceStore((store) => store.visibleSections);
  const toggleSection = useWorkspaceStore((store) => store.toggleSection);
  const isShellOpen = useWorkspaceStore((store) => store.isShellOpen);
  const toggleShell = useWorkspaceStore((store) => store.toggleShell);
  const uiScalePercent = useWorkspaceStore((store) => store.uiScalePercent);
  const setUiScalePercent = useWorkspaceStore((store) => store.setUiScalePercent);
  const globalRules = useWorkspaceStore((store) => store.globalRules);
  const projectRulesByRoot = useWorkspaceStore((store) => store.projectRulesByRoot);
  const setGlobalRules = useWorkspaceStore((store) => store.setGlobalRules);
  const setProjectRules = useWorkspaceStore((store) => store.setProjectRules);
  const [selectedCompatibilityPresetIds, setSelectedCompatibilityPresetIds] = useState<string[]>([
    "typescript",
    "data-config",
  ]);
  const [compatibilityStatus, setCompatibilityStatus] = useState<string | null>(null);

  const selectedProjectRules = selectedProjectRoot
    ? (projectRulesByRoot[selectedProjectRoot] ?? "")
    : "";
  const vscodeCompatibilityFiles = createVscodeCompatibilityFiles(
    selectedCompatibilityPresetIds,
  );

  async function copyTextToClipboard(text: string) {
    await navigator.clipboard?.writeText(text);
  }

  async function applyVscodeCompatibilityFiles() {
    if (!selectedProjectRoot || selectedCompatibilityPresetIds.length === 0) {
      return;
    }

    const existingExtensions = await readProjectJsonFile(
      selectedProjectRoot,
      ".vscode/extensions.json",
    );
    const existingSettings = await readProjectJsonFile(
      selectedProjectRoot,
      ".vscode/settings.json",
    );
    const nextExtensions = mergeVscodeExtensionsJson(
      existingExtensions,
      JSON.parse(vscodeCompatibilityFiles.extensionsJson),
    );
    const nextSettings = mergeJsonObjects(
      existingSettings,
      JSON.parse(vscodeCompatibilityFiles.settingsJson),
    );

    await tauriCodemindRepository.saveProjectFile(
      selectedProjectRoot,
      ".vscode/extensions.json",
      formatJson(nextExtensions),
    );
    await tauriCodemindRepository.saveProjectFile(
      selectedProjectRoot,
      ".vscode/settings.json",
      formatJson(nextSettings),
    );
    setCompatibilityStatus("VS Code compatibility files merged.");
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
      <section className="flex max-h-[88vh] w-[720px] flex-col rounded-md border border-zinc-800 bg-[#1e1e1e] shadow-2xl">
        <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Settings size={16} />
            Settings
          </div>
          <Button
            className="h-8 w-8 px-0"
            variant="ghost"
            icon={<X size={15} />}
            onClick={onClose}
          />
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto p-4">
          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-200">Sections</h2>
            <div className="grid grid-cols-4 gap-2">
              {[
                ["sessions", "Sessions"],
                ["explorer", "Files"],
                ["editor", "Code"],
                ["chat", "Chat"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={visibleSections[value as keyof typeof visibleSections] ? "primary" : "secondary"}
                  onClick={() => toggleSection(value as keyof typeof visibleSections)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-200">Terminal</h2>
            <Button variant={isShellOpen ? "primary" : "secondary"} onClick={toggleShell}>
              {isShellOpen ? "Shell visible" : "Show shell"}
            </Button>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-200">Interface Scale</h2>
              <span className="text-xs tabular-nums text-zinc-400">{uiScalePercent}%</span>
            </div>
            <input
              className="h-2 w-full accent-emerald-400"
              type="range"
              min={80}
              max={140}
              step={5}
              value={uiScalePercent}
              onChange={(event) => setUiScalePercent(Number(event.target.value))}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-200">Rules</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              <RuleTextArea
                label="Global rules"
                value={globalRules}
                placeholder="Rules applied to every provider request..."
                onChange={setGlobalRules}
              />
              <RuleTextArea
                label="Project rules"
                value={selectedProjectRules}
                placeholder={
                  selectedProjectRoot
                    ? "Rules applied when this project is selected..."
                    : "Select a project folder to edit project rules."
                }
                disabled={!selectedProjectRoot}
                onChange={(rules) => {
                  if (selectedProjectRoot) {
                    setProjectRules(selectedProjectRoot, rules);
                  }
                }}
              />
            </div>
            {selectedProjectRoot ? (
              <p className="mt-2 truncate text-xs text-zinc-500">
                Project: {selectedProjectRoot}
              </p>
            ) : null}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-200">
                  VS Code / Open VSX Compatibility
                </h2>
                <p className="text-xs text-zinc-500">
                  Generate extension recommendations and formatter settings for this project.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  className="h-8 w-8 px-0"
                  variant="ghost"
                  title="Copy extensions.json"
                  icon={<Copy size={14} />}
                  onClick={() => void copyTextToClipboard(vscodeCompatibilityFiles.extensionsJson)}
                />
                <Button
                  className="h-8 w-8 px-0"
                  variant="ghost"
                  title="Copy settings.json"
                  icon={<Copy size={14} />}
                  onClick={() => void copyTextToClipboard(vscodeCompatibilityFiles.settingsJson)}
                />
                <Button
                  className="h-8"
                  variant="primary"
                  disabled={!selectedProjectRoot || selectedCompatibilityPresetIds.length === 0}
                  onClick={() => void applyVscodeCompatibilityFiles()}
                >
                  Apply
                </Button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {vscodeCompatibilityPresets.map((preset) => {
                const isSelected = selectedCompatibilityPresetIds.includes(preset.id);

                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 text-left transition",
                      isSelected
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700",
                    )}
                    onClick={() => {
                      setCompatibilityStatus(null);
                      setSelectedCompatibilityPresetIds((currentPresetIds) =>
                        currentPresetIds.includes(preset.id)
                          ? currentPresetIds.filter((presetId) => presetId !== preset.id)
                          : [...currentPresetIds, preset.id],
                      );
                    }}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        isSelected
                          ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                          : "border-zinc-700",
                      )}
                    >
                      {isSelected ? <Check size={12} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm text-zinc-100">{preset.name}</span>
                        <Badge className="capitalize text-zinc-400">{preset.category}</Badge>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-zinc-500">
                        {preset.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedProjectRoot ? (
              <p className="mt-2 truncate text-xs text-zinc-500">
                Target: {selectedProjectRoot}/.vscode
              </p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">
                Select a project folder before applying workspace compatibility files.
              </p>
            )}
            {compatibilityStatus ? (
              <p className="mt-2 text-xs text-emerald-300">{compatibilityStatus}</p>
            ) : null}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-200">CopilotKit MCP Tools</h2>
              <Badge>{copilotKitMcpServerUrl}</Badge>
            </div>
            <div className="space-y-2">
              {[projectMcpToolUsage, ...agentMcpToolUsage].map((toolUsage) => (
                <div
                  key={`${toolUsage.providerId}-${toolUsage.scope}-${toolUsage.title}`}
                  className="rounded-md border border-zinc-800 bg-zinc-950 p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-zinc-100">{toolUsage.title}</p>
                        <Badge className="capitalize text-zinc-400">{toolUsage.scope}</Badge>
                      </div>
                      <p className="text-xs text-zinc-500">{toolUsage.detail}</p>
                    </div>
                    <Button
                      className="h-8 w-8 shrink-0 px-0"
                      variant="ghost"
                      title="Copy MCP setup"
                      icon={<Copy size={14} />}
                      onClick={() => void copyTextToClipboard(toolUsage.commandOrConfig)}
                    />
                  </div>
                  <pre className="max-h-32 overflow-auto rounded border border-zinc-800 bg-[#171717] p-2 text-xs leading-5 text-zinc-300">
                    <code>{toolUsage.commandOrConfig}</code>
                  </pre>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-zinc-200">Agent Providers</h2>
            <div className="space-y-2">
              {agentProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 p-3"
                >
                  <div>
                    <p className="text-sm text-zinc-100">{provider.name}</p>
                    <p className="text-xs text-zinc-500">{provider.description}</p>
                  </div>
                  <Badge className={provider.isAvailable ? "text-zinc-100" : "text-zinc-400"}>
                    {provider.isAvailable ? "Ready" : "Adapter"}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

interface RuleTextAreaProps {
  label: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (rules: string) => void;
}

function RuleTextArea({
  label,
  value,
  placeholder,
  disabled = false,
  onChange,
}: RuleTextAreaProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <textarea
        className="h-32 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 text-sm leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

async function readProjectJsonFile(projectRoot: string, relativePath: string) {
  try {
    const projectFile = await tauriCodemindRepository.readProjectFile(
      projectRoot,
      relativePath,
    );
    const parsedContent: unknown = JSON.parse(projectFile.content);
    return isJsonObject(parsedContent) ? parsedContent : {};
  } catch {
    return {};
  }
}

function mergeVscodeExtensionsJson(
  existingExtensionsJson: Record<string, unknown>,
  nextExtensionsJson: Record<string, unknown>,
) {
  const existingRecommendations = getStringArray(
    existingExtensionsJson.recommendations,
  );
  const nextRecommendations = getStringArray(nextExtensionsJson.recommendations);

  return {
    ...existingExtensionsJson,
    recommendations: Array.from(
      new Set([...existingRecommendations, ...nextRecommendations]),
    ).sort(),
  };
}

function mergeJsonObjects(
  existingObject: Record<string, unknown>,
  nextObject: Record<string, unknown>,
): Record<string, unknown> {
  const mergedObject = { ...existingObject };

  for (const [key, value] of Object.entries(nextObject)) {
    const existingValue = mergedObject[key];
    if (isJsonObject(existingValue) && isJsonObject(value)) {
      mergedObject[key] = mergeJsonObjects(existingValue, value);
      continue;
    }

    mergedObject[key] = value;
  }

  return mergedObject;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
