import { listen } from "@tauri-apps/api/event";
import { Effect } from "effect";
import {
  Box,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cpu,
  Download,
  FileCode,
  Hammer,
  Image,
  LoaderCircle,
  LogIn,
  RotateCcw,
  Search,
  Send,
  Square,
  Star,
  Terminal,
  User,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { agentProviders } from "../../../domain/models/agent";
import type { AgentTokenEvent, ChatMessage, Session } from "../../../domain/models/session";
import { createAgentRuleContext } from "../../../domain/logic/ruleContext";
import { validatePrompt } from "../../../application/use-cases/messageWorkflow";
import {
  codemindQueryKeys,
  useInstallProvider,
  useMessages,
  useProviderInstallStatus,
  useSendMessage,
  useStopMessageResponse,
  useUpdateSessionAgent,
} from "../../../application/use-cases/sessionQueries";
import { Button } from "../../components/button/Button";
import { Panel } from "../../components/panel/Panel";
import { ApprovalQueue } from "../approvals/ApprovalQueue";
import type { DiffProposal } from "../../../domain/models/approval";
import { tauriCodemindRepository } from "../../../infrastructure/tauri/codemindRepository";
import { useWorkspaceStore } from "../../../stores/workspaceStore";

interface ChatPanelProps {
  session: Session | null;
  onSelectDiff: (proposal: DiffProposal | null) => void;
  selectedDiffId: string | null;
}

const agentWorkModes = ["Build", "Plan"] as const;
const FAVORITE_MODELS_STORAGE_KEY = "codemind.favoriteModels";
const STOPPED_RESPONSE_TEXT = "Stopped by user.";
const LONG_TIMELINE_ACTIVITY_COUNT = 6;
const toastDisplayTimeInMilliseconds = 4600;
const approvalModeOptions: ApprovalModeOption[] = [
  {
    label: "Supervised",
    value: "supervised",
    description: "Allow requested edits, ask before risky actions",
  },
  {
    label: "Auto-accept edits",
    value: "auto-accept-edits",
    description: "Auto-approve edits, ask before other actions",
  },
  {
    label: "Full access",
    value: "full-access",
    description: "Allow commands and edits without prompts",
  },
];

type AgentWorkMode = (typeof agentWorkModes)[number];
type ApprovalMode = "supervised" | "auto-accept-edits" | "full-access";
type TimelineFilter = "all" | "thinking" | "tool" | "approval";
type ToastKind = "success" | "error" | "info";

interface ApprovalModeOption {
  label: string;
  value: ApprovalMode;
  description: string;
}

interface ActivityEntry {
  id: string;
  message: string;
  kind: NonNullable<AgentTokenEvent["activityKind"]>;
  detail?: string | null;
  output?: string | null;
}

interface ResponseRunStats {
  startedAt: number;
  completedAt?: number;
}

interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

export function ChatPanel({ session, onSelectDiff, selectedDiffId }: ChatPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("gpt-5.5");
  const [selectedReasoning, setSelectedReasoning] = useState("medium");
  const [selectedWorkMode, setSelectedWorkMode] = useState<AgentWorkMode>("Build");
  const [selectedApprovalMode, setSelectedApprovalMode] = useState<ApprovalMode>("supervised");
  const [isProviderMenuOpen, setIsProviderMenuOpen] = useState(false);
  const [activityByMessageId, setActivityByMessageId] = useState<
    Record<string, ActivityEntry[]>
  >({});
  const [responseRunStatsByMessageId, setResponseRunStatsByMessageId] = useState<
    Record<string, ResponseRunStats>
  >({});
  const [timelineFilterByMessageId, setTimelineFilterByMessageId] = useState<
    Record<string, TimelineFilter>
  >({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [, setClockTick] = useState(0);
  const [expandedActivityKeys, setExpandedActivityKeys] = useState<Set<string>>(() => new Set());
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<string | null>(null);
  const [isStoppingResponse, setIsStoppingResponse] = useState(false);
  const globalRules = useWorkspaceStore((store) => store.globalRules);
  const projectRulesByRoot = useWorkspaceStore((store) => store.projectRulesByRoot);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToLatestMessageRef = useRef(true);
  const currentSessionId = session?.id ?? null;
  const messages = useMessages(currentSessionId);
  const sendMessage = useSendMessage(currentSessionId);
  const stopMessageResponse = useStopMessageResponse(currentSessionId);
  const updateSessionAgent = useUpdateSessionAgent();
  const codexCliInstallStatus = useProviderInstallStatus("codex-cli");
  const installCodexCli = useInstallProvider("codex-cli");
  const queryClient = useQueryClient();
  const selectedProviderId = session?.agentId ?? "codex-cli";
  const selectedProvider = agentProviders.find(
    (provider) => provider.id === selectedProviderId,
  );
  const isSelectedCodexCliMissing =
    selectedProviderId === "codex-cli" &&
    codexCliInstallStatus.data?.isInstalled === false;
  const isSelectedProviderLoggedIn = Boolean(selectedProvider?.isAvailable);
  const selectedModelLabel =
    selectedProvider?.models.find((model) => model.value === selectedModel)?.label ??
    selectedProvider?.models[0]?.label ??
    "Model";
  const selectedReasoningLabel =
    selectedProvider?.reasoningEfforts.find((reasoning) => reasoning.value === selectedReasoning)
      ?.label ??
    selectedProvider?.reasoningEfforts[0]?.label ??
    "Reasoning";
  const latestMessageId = messages.data?.[messages.data.length - 1]?.id ?? null;
  const isResponseActive = sendMessage.isPending || Boolean(activeAssistantMessageId);
  const activeIndicatorMessageId =
    activeAssistantMessageId ?? (sendMessage.isPending ? latestMessageId : null);

  useEffect(() => {
    if (!isResponseActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setClockTick((currentClockTick) => currentClockTick + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isResponseActive]);

  useEffect(() => {
    if (!canListenToTauriEvents()) {
      return;
    }

    const unlistenPromise = listen<AgentTokenEvent>("agent-token", (event) => {
      if (event.payload.sessionId === currentSessionId) {
        setResponseRunStatsByMessageId((currentStatsByMessageId) => {
          const currentStats = currentStatsByMessageId[event.payload.messageId];
          if (event.payload.isComplete) {
            return {
              ...currentStatsByMessageId,
              [event.payload.messageId]: {
                startedAt: currentStats?.startedAt ?? Date.now(),
                completedAt: currentStats?.completedAt ?? Date.now(),
              },
            };
          }

          if (currentStats) {
            return currentStatsByMessageId;
          }

          return {
            ...currentStatsByMessageId,
            [event.payload.messageId]: { startedAt: Date.now() },
          };
        });

        if (event.payload.isComplete) {
          setActiveAssistantMessageId((currentActiveAssistantMessageId) =>
            currentActiveAssistantMessageId === event.payload.messageId
              ? null
              : currentActiveAssistantMessageId,
          );
          setIsStoppingResponse(false);
        } else {
          setActiveAssistantMessageId(event.payload.messageId);
        }
      }

      if (event.payload.activityMessage) {
        const activityMessage = event.payload.activityMessage;
        const activityKind = event.payload.activityKind ?? "status";
        const activityId =
          event.payload.activityId ??
          `${event.payload.messageId}:${activityKind}:${activityMessage}`;
        setActivityByMessageId((currentActivityByMessageId) => {
          const currentActivity = currentActivityByMessageId[event.payload.messageId] ?? [];
          const existingActivityIndex = currentActivity.findIndex(
            (activityEntry) => activityEntry.id === activityId,
          );
          const nextActivityEntry: ActivityEntry = {
            id: activityId,
            message: activityMessage,
            kind: activityKind,
            detail: event.payload.activityDetail,
            output: event.payload.activityOutput,
          };

          if (existingActivityIndex >= 0) {
            const existingActivity = currentActivity[existingActivityIndex];
            const mergedActivity = {
              ...existingActivity,
              ...nextActivityEntry,
              detail: nextActivityEntry.detail ?? existingActivity.detail,
              output: nextActivityEntry.output ?? existingActivity.output,
            };
            const nextActivity = [...currentActivity];
            nextActivity[existingActivityIndex] = mergedActivity;

            return {
              ...currentActivityByMessageId,
              [event.payload.messageId]: nextActivity,
            };
          }

          return {
            ...currentActivityByMessageId,
            [event.payload.messageId]: [
              ...currentActivity,
              nextActivityEntry,
            ],
          };
        });

        if (activityKind === "approval") {
          showToast({
            kind: "info",
            title: "Approval requested",
            description: activityMessage,
          });
        }
      }

      queryClient.setQueryData<ChatMessage[]>(
        codemindQueryKeys.messages(event.payload.sessionId),
        (currentMessages = []) =>
          currentMessages.map((message) =>
            message.id === event.payload.messageId
              ? {
                  ...message,
                  content:
                    event.payload.token.length === 0
                      ? message.content
                      : `${message.content}${event.payload.token}`,
                }
              : message,
          ),
      );
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [currentSessionId, queryClient]);

  useEffect(() => {
    setActiveAssistantMessageId(null);
    setIsStoppingResponse(false);
    shouldStickToLatestMessageRef.current = true;
  }, [currentSessionId]);

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }

    if (!selectedProvider.models.some((model) => model.value === selectedModel)) {
      setSelectedModel(selectedProvider.models[0]?.value ?? "default");
    }

    if (
      !selectedProvider.reasoningEfforts.some(
        (reasoning) => reasoning.value === selectedReasoning,
      )
    ) {
      setSelectedReasoning(selectedProvider.reasoningEfforts[0]?.value ?? "medium");
    }
  }, [selectedModel, selectedProvider, selectedReasoning]);

  useEffect(() => {
    const messageListElement = messageListRef.current;
    if (!messageListElement || !shouldStickToLatestMessageRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      messageListElement.scrollTo({
        top: messageListElement.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [messages.data, activityByMessageId, activeIndicatorMessageId]);

  function handleMessageListScroll() {
    const messageListElement = messageListRef.current;
    if (!messageListElement) {
      return;
    }

    const distanceFromBottom =
      messageListElement.scrollHeight -
      messageListElement.scrollTop -
      messageListElement.clientHeight;
    shouldStickToLatestMessageRef.current = distanceFromBottom < 96;
  }

  async function handleSendMessage() {
    if (!session) {
      return;
    }

    if (isResponseActive) {
      return;
    }

    if (isSelectedCodexCliMissing) {
      setComposerError("Install Codex CLI before sending with this provider.");
      return;
    }

    const validationResult = await Effect.runPromiseExit(validatePrompt(draftMessage));
    if (validationResult._tag === "Failure") {
      setComposerError("Type a message before sending.");
      return;
    }

    setComposerError(null);
    const messageToSend = draftMessage;
    const ruleContext = createAgentRuleContext({
      globalRules,
      projectRules: session.projectRoot ? (projectRulesByRoot[session.projectRoot] ?? "") : "",
      projectRoot: session.projectRoot,
    });
    setDraftMessage("");
    shouldStickToLatestMessageRef.current = true;
    const updatedMessages = await sendMessage.mutateAsync({
      content: messageToSend,
      model: selectedModel,
      reasoningEffort: selectedReasoning,
      ruleContext,
      workMode: selectedWorkMode.toLowerCase(),
      approvalMode: selectedApprovalMode,
    });
    const createdAssistantMessage = [...updatedMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    setActiveAssistantMessageId(createdAssistantMessage?.id ?? null);
  }

  async function handleStopResponse() {
    if (!session || !isResponseActive) {
      return;
    }

    setComposerError(null);
    setIsStoppingResponse(true);
    try {
      await stopMessageResponse.mutateAsync();
    } catch (error) {
      setComposerError(formatUnknownError(error));
      setIsStoppingResponse(false);
    }
  }

  async function handleChangeProvider(agentId: string) {
    if (!session) {
      return;
    }

    await updateSessionAgent.mutateAsync({ sessionId: session.id, agentId });
  }

  async function handleProviderLogin() {
    if (!session) {
      return;
    }
    try {
      await tauriCodemindRepository.runProviderLogin(session.agentId);
      showToast({
        kind: "success",
        title: "Login started",
        description: `${selectedProvider?.name ?? "Provider"} opened its login flow.`,
      });
    } catch (error) {
      showToast({
        kind: "error",
        title: "Login failed",
        description: formatUnknownError(error),
      });
    }
  }

  async function handleInstallCodexCli() {
    setComposerError(null);
    try {
      await installCodexCli.mutateAsync();
      showToast({
        kind: "success",
        title: "Codex CLI installed",
        description: "Provider models are ready to use.",
      });
    } catch (error) {
      const installError = formatUnknownError(error);
      setComposerError(installError);
      showToast({
        kind: "error",
        title: "Install failed",
        description: installError,
      });
    }
  }

  function toggleActivityExpansion(activityKey: string) {
    setExpandedActivityKeys((currentExpandedActivityKeys) => {
      const nextExpandedActivityKeys = new Set(currentExpandedActivityKeys);
      if (nextExpandedActivityKeys.has(activityKey)) {
        nextExpandedActivityKeys.delete(activityKey);
      } else {
        nextExpandedActivityKeys.add(activityKey);
      }
      return nextExpandedActivityKeys;
    });
  }

  function setTimelineFilter(messageId: string, timelineFilter: TimelineFilter) {
    setTimelineFilterByMessageId((currentFilterByMessageId) => ({
      ...currentFilterByMessageId,
      [messageId]: timelineFilter,
    }));
  }

  function showToast(toastMessage: Omit<ToastMessage, "id">) {
    const toastId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}:${Math.random()}`;
    const nextToast = { ...toastMessage, id: toastId };
    setToasts((currentToasts) => [...currentToasts.slice(-3), nextToast]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
    }, toastDisplayTimeInMilliseconds);
  }

  function dismissToast(toastId: string) {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  }

  async function handleResumeResponse() {
    if (!session || isResponseActive) {
      return;
    }

    setComposerError(null);
    shouldStickToLatestMessageRef.current = true;
    const ruleContext = createAgentRuleContext({
      globalRules,
      projectRules: session.projectRoot ? (projectRulesByRoot[session.projectRoot] ?? "") : "",
      projectRoot: session.projectRoot,
    });
    const updatedMessages = await sendMessage.mutateAsync({
      content:
        "Resume the interrupted response from where it stopped. Continue the same task and avoid repeating completed work unless needed for context.",
      model: selectedModel,
      reasoningEffort: selectedReasoning,
      ruleContext,
      workMode: selectedWorkMode.toLowerCase(),
      approvalMode: selectedApprovalMode,
    });
    const createdAssistantMessage = [...updatedMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    setActiveAssistantMessageId(createdAssistantMessage?.id ?? null);
  }

  const SendButtonIcon = isStoppingResponse ? LoaderCircle : isResponseActive ? Square : Send;
  const sendButtonTitle = isResponseActive ? "Stop response" : "Send message";

  return (
    <Panel className="relative flex h-full min-w-0 flex-col bg-[#181818]">
      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        onScroll={handleMessageListScroll}
      >
        {!session ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Create or select a chat to begin.
          </div>
        ) : null}
        {messages.data?.map((message) => {
          const activityMessages = activityByMessageId[message.id] ?? [];
          const selectedTimelineFilter = timelineFilterByMessageId[message.id] ?? "all";
          const visibleActivityMessages = filterActivityMessages(
            activityMessages,
            selectedTimelineFilter,
          );
          const isMessageActive = activeIndicatorMessageId === message.id;
          const responseRunStats = responseRunStatsByMessageId[message.id];
          const changedFiles = isMessageActive ? [] : extractChangedFileNames(message);
          const shouldRenderAssistantMessage =
            message.role !== "assistant" ||
            message.content.length > 0 ||
            activityMessages.length > 0 ||
            isMessageActive;
          const assistantActivityContent =
            message.role === "assistant" ? (
              <>
                {activityMessages.length >= LONG_TIMELINE_ACTIVITY_COUNT ? (
                  <TimelineFilters
                    selectedFilter={selectedTimelineFilter}
                    activityMessages={activityMessages}
                    onSelectFilter={(timelineFilter) =>
                      setTimelineFilter(message.id, timelineFilter)
                    }
                  />
                ) : null}
                {visibleActivityMessages.map((activityMessage, activityIndex) => {
                  const activityKey = activityMessage.id || `${message.id}:${activityIndex}`;
                  return (
                    <AgentActivityRow
                      key={activityKey}
                      activityMessage={activityMessage}
                      isExpanded={expandedActivityKeys.has(activityKey)}
                      onToggle={() => toggleActivityExpansion(activityKey)}
                    />
                  );
                })}
              </>
            ) : null;
          const assistantFooterContent =
            isMessageActive ? (
              <ResponseProgressIndicator isStopping={isStoppingResponse} />
            ) : (
              <ResponseCompletionActions
                changedFiles={changedFiles}
                canResume={isStoppedAssistantMessage(message, activityMessages)}
                onResume={handleResumeResponse}
              />
            );

          return (
            <div key={message.id}>
              {shouldRenderAssistantMessage ? (
                <ChatBubble
                  message={message}
                  responseRunStats={responseRunStats}
                  commandCount={countCommandActivities(activityMessages)}
                  activityContent={assistantActivityContent}
                  footerContent={assistantFooterContent}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <ApprovalQueue
        sessionId={session?.id ?? null}
        selectedDiffId={selectedDiffId}
        onSelectDiff={onSelectDiff}
        onNotify={showToast}
      />

      <div className="border-t border-zinc-800 p-2">
        <div className="rounded-md border border-zinc-800 bg-[#1f1f1f] p-2">
          <textarea
            className="h-16 w-full resize-none bg-transparent px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder="Ask Codemind to inspect, refactor, explain, or plan changes..."
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !isResponseActive) {
                void handleSendMessage();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <ProviderModelMenu
                isOpen={isProviderMenuOpen}
                selectedProviderId={session?.agentId ?? "codex-cli"}
                selectedProviderName={selectedProvider?.name ?? "Provider"}
                selectedModel={selectedModel}
                selectedModelLabel={selectedModelLabel}
                selectedReasoning={selectedReasoning}
                selectedReasoningLabel={selectedReasoningLabel}
                selectedApprovalMode={selectedApprovalMode}
                isSelectedProviderMissing={isSelectedCodexCliMissing}
                isInstallingProvider={installCodexCli.isPending}
                installCommand={
                  codexCliInstallStatus.data?.installCommand ?? "npm i -g @openai/codex"
                }
                installError={
                  installCodexCli.error ? formatUnknownError(installCodexCli.error) : null
                }
                onOpenChange={setIsProviderMenuOpen}
                onProviderChange={handleChangeProvider}
                onModelChange={setSelectedModel}
                onReasoningChange={setSelectedReasoning}
                onApprovalModeChange={setSelectedApprovalMode}
                onInstallProvider={handleInstallCodexCli}
              />
              <BuildPlanToggle
                selectedWorkMode={selectedWorkMode}
                onWorkModeChange={setSelectedWorkMode}
              />
              {composerError ? <span className="text-xs text-red-300">{composerError}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {!isSelectedProviderLoggedIn ? (
                <Button
                  className="h-7 w-7 px-0"
                  variant="ghost"
                  title={`Sign in to ${selectedProvider?.name ?? "provider"}`}
                  icon={<LogIn size={13} />}
                  onClick={handleProviderLogin}
                />
              ) : null}
              <Button className="h-7 w-7 px-0" variant="ghost" icon={<Image size={13} />} />
              <Button
                className="h-7 w-7 rounded-full px-0"
                variant={isResponseActive ? "danger" : "primary"}
                title={sendButtonTitle}
                aria-label={sendButtonTitle}
                icon={
                  <SendButtonIcon
                    size={13}
                    className={isStoppingResponse ? "animate-spin" : undefined}
                  />
                }
                disabled={
                  !session ||
                  (isResponseActive ? isStoppingResponse : isSelectedCodexCliMissing)
                }
                onClick={isResponseActive ? handleStopResponse : handleSendMessage}
              />
            </div>
          </div>
        </div>
      </div>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </Panel>
  );
}

function canListenToTauriEvents(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const tauriInternals = (
    window as Window & {
      __TAURI_INTERNALS__?: { transformCallback?: unknown };
    }
  ).__TAURI_INTERNALS__;

  return typeof tauriInternals?.transformCallback === "function";
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Something went wrong while installing Codex CLI.";
}

function BuildPlanToggle({
  selectedWorkMode,
  onWorkModeChange,
}: {
  selectedWorkMode: AgentWorkMode;
  onWorkModeChange: (workMode: AgentWorkMode) => void;
}) {
  const WorkModeIcon = selectedWorkMode === "Build" ? Hammer : ClipboardList;
  const nextWorkMode = selectedWorkMode === "Build" ? "Plan" : "Build";

  return (
    <button
      type="button"
      className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2a2a2a] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
      title={`${selectedWorkMode} mode`}
      aria-label={`${selectedWorkMode} mode. Switch to ${nextWorkMode} mode`}
      onClick={() => onWorkModeChange(nextWorkMode)}
    >
      <WorkModeIcon size={13} />
    </button>
  );
}

interface ProviderModelMenuProps {
  isOpen: boolean;
  selectedProviderId: string;
  selectedProviderName: string;
  selectedModel: string;
  selectedModelLabel: string;
  selectedReasoning: string;
  selectedReasoningLabel: string;
  selectedApprovalMode: ApprovalMode;
  isSelectedProviderMissing: boolean;
  isInstallingProvider: boolean;
  installCommand: string;
  installError: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onProviderChange: (agentId: string) => void;
  onModelChange: (model: string) => void;
  onReasoningChange: (reasoning: string) => void;
  onApprovalModeChange: (approvalMode: ApprovalMode) => void;
  onInstallProvider: () => void;
}

function ProviderModelMenu({
  isOpen,
  selectedProviderId,
  selectedProviderName,
  selectedModel,
  selectedModelLabel,
  selectedReasoning,
  selectedReasoningLabel,
  selectedApprovalMode,
  isSelectedProviderMissing,
  isInstallingProvider,
  installCommand,
  installError,
  onOpenChange,
  onProviderChange,
  onModelChange,
  onReasoningChange,
  onApprovalModeChange,
  onInstallProvider,
}: ProviderModelMenuProps) {
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [isPermissionSettingsOpen, setIsPermissionSettingsOpen] = useState(false);
  const [favoriteModelKeys, setFavoriteModelKeys] = useState<Set<string>>(() =>
    readFavoriteModelKeys(),
  );
  const selectedProvider = agentProviders.find((provider) => provider.id === selectedProviderId);
  const selectedApprovalModeLabel =
    approvalModeOptions.find((approvalMode) => approvalMode.value === selectedApprovalMode)
      ?.label ?? "Permissions";
  const normalizedModelSearchQuery = modelSearchQuery.trim().toLowerCase();
  const visibleModels = (selectedProvider?.models ?? []).filter((model) => {
    if (!normalizedModelSearchQuery) {
      return true;
    }

    return (
      model.label.toLowerCase().includes(normalizedModelSearchQuery) ||
      model.value.toLowerCase().includes(normalizedModelSearchQuery)
    );
  });

  function handleToggleFavoriteModel(modelValue: string) {
    const favoriteModelKey = createFavoriteModelKey(selectedProviderId, modelValue);
    setFavoriteModelKeys((currentFavoriteModelKeys) => {
      const nextFavoriteModelKeys = new Set(currentFavoriteModelKeys);
      if (nextFavoriteModelKeys.has(favoriteModelKey)) {
        nextFavoriteModelKeys.delete(favoriteModelKey);
      } else {
        nextFavoriteModelKeys.add(favoriteModelKey);
      }
      writeFavoriteModelKeys(nextFavoriteModelKeys);
      return nextFavoriteModelKeys;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2a2a2a] text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
        onClick={() => onOpenChange(!isOpen)}
        aria-label="Provider and model"
        title={`${selectedProviderName}: ${selectedModelLabel}, ${selectedReasoningLabel}`}
      >
        <ProviderIcon providerId={selectedProviderId} size={14} />
      </button>

      {isOpen ? (
        <div className="absolute bottom-9 right-0 z-30 flex h-[420px] w-[360px] overflow-hidden rounded-lg border border-zinc-800 bg-[#1f1f1f] shadow-2xl">
          <div className="relative flex w-12 shrink-0 flex-col justify-between border-r border-zinc-800 bg-[#181818] py-2">
            <div className="flex flex-col items-center gap-1">
              {agentProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`relative flex h-9 w-9 items-center justify-center rounded-md ${
                  provider.id === selectedProviderId
                    ? "bg-zinc-950 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
                title={provider.name}
                aria-label={provider.name}
                onClick={() => onProviderChange(provider.id)}
              >
                {provider.id === selectedProviderId ? (
                  <span className="absolute left-[-6px] h-5 w-1 rounded-r bg-emerald-400" />
                ) : null}
                <ProviderIcon providerId={provider.id} size={17} />
                {!provider.isAvailable ? (
                  <LogIn size={10} className="absolute bottom-1 right-1 text-zinc-500" />
                ) : null}
              </button>
              ))}
            </div>

            <div className="flex flex-col items-center border-t border-zinc-800 pt-2">
              <button
                type="button"
                className={`flex h-9 w-9 items-center justify-center rounded-md ${
                  isPermissionSettingsOpen
                    ? "bg-zinc-950 text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
                title={`Permissions: ${selectedApprovalModeLabel}`}
                aria-label={`Permissions: ${selectedApprovalModeLabel}`}
                onClick={() => setIsPermissionSettingsOpen(!isPermissionSettingsOpen)}
              >
                <Wrench size={16} />
              </button>
            </div>

            {isPermissionSettingsOpen ? (
              <div className="absolute bottom-2 left-12 z-40 w-64 rounded-lg border border-zinc-800 bg-[#202020] p-2 shadow-2xl">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  <Wrench size={12} />
                  Permissions
                </div>
                <div className="grid gap-1">
                  {approvalModeOptions.map((approvalMode) => (
                    <button
                      key={approvalMode.value}
                      type="button"
                      className={`rounded-md px-2 py-1.5 text-left ${
                        approvalMode.value === selectedApprovalMode
                          ? "bg-zinc-700 text-zinc-100"
                          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                      }`}
                      onClick={() => {
                        onApprovalModeChange(approvalMode.value);
                        setIsPermissionSettingsOpen(false);
                      }}
                    >
                      <span className="block text-xs font-medium">{approvalMode.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">
                        {approvalMode.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="border-b border-zinc-800 p-2">
              <label className="flex h-8 items-center gap-2 rounded-md border border-blue-500/50 bg-[#171717] px-2 text-xs text-zinc-500 ring-1 ring-blue-500/20">
                <Search size={14} className="shrink-0" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-zinc-200 outline-none placeholder:text-zinc-600"
                  value={modelSearchQuery}
                  onChange={(event) => setModelSearchQuery(event.target.value)}
                  placeholder="Search models..."
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
              {visibleModels.length > 0 ? (
                visibleModels.map((model, modelIndex) => {
                  const isSelectedModel = model.value === selectedModel;
                  const isFavoriteModel = favoriteModelKeys.has(
                    createFavoriteModelKey(selectedProviderId, model.value),
                  );
                  return (
                    <div
                      key={model.value}
                      className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2 text-left ${
                        isSelectedModel
                          ? "bg-[#2a2a2a] text-zinc-100"
                          : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
                      }`}
                    >
                      <button
                        type="button"
                        className={`flex h-6 w-6 items-center justify-center rounded ${
                          isFavoriteModel
                            ? "text-amber-400 hover:bg-amber-400/10"
                            : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                        }`}
                        title={isFavoriteModel ? "Remove from favorites" : "Add to favorites"}
                        aria-label={isFavoriteModel ? "Remove from favorites" : "Add to favorites"}
                        onClick={() => handleToggleFavoriteModel(model.value)}
                      >
                        <Star
                          size={15}
                          className={isFavoriteModel ? "fill-amber-400" : undefined}
                        />
                      </button>
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => onModelChange(model.value)}
                      >
                        <span className="block truncate text-xs font-semibold">
                          {model.label}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                          <ProviderIcon providerId={selectedProviderId} size={12} />
                          {selectedProviderName}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1"
                        onClick={() => onModelChange(model.value)}
                      >
                        {isSelectedModel ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : null}
                        <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          Ctrl+{modelIndex + 1}
                        </span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="px-3 py-8 text-center text-xs text-zinc-500">
                  No models found.
                </div>
              )}
            </div>

            <div className="border-t border-zinc-800 bg-[#1b1b1b] p-2">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                <Brain size={12} />
                Reasoning
              </div>
              <div className="mb-3 grid grid-cols-4 gap-1">
                {(selectedProvider?.reasoningEfforts ?? []).map((reasoning) => (
                  <button
                    key={reasoning.value}
                    type="button"
                    className={`rounded px-2 py-1.5 text-center text-[11px] ${
                      reasoning.value === selectedReasoning
                        ? "bg-zinc-700 text-zinc-100"
                        : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                    onClick={() => onReasoningChange(reasoning.value)}
                  >
                    {reasoning.label}
                  </button>
                ))}
              </div>

            </div>
            {isSelectedProviderMissing ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[1px]">
                <div className="w-full max-w-[280px] rounded-md border border-zinc-700 bg-[#181818] p-4 shadow-2xl">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                    <Terminal size={15} />
                    Codex CLI missing
                  </div>
                  <p className="mb-3 text-xs leading-5 text-zinc-400">
                    Install Codex CLI to use these provider models.
                  </p>
                  <pre className="mb-3 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-300">
                    <code>{installCommand}</code>
                  </pre>
                  {installError ? (
                    <p className="mb-3 max-h-20 overflow-y-auto rounded border border-red-500/20 bg-red-500/10 p-2 text-xs leading-5 text-red-200">
                      {installError}
                    </p>
                  ) : null}
                  <Button
                    className="w-full"
                    variant="primary"
                    disabled={isInstallingProvider}
                    icon={
                      isInstallingProvider ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )
                    }
                    onClick={onInstallProvider}
                  >
                    {isInstallingProvider ? "Installing" : "Install Codex CLI"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function createFavoriteModelKey(providerId: string, modelValue: string): string {
  return `${providerId}:${modelValue}`;
}

function readFavoriteModelKeys(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const serializedFavoriteModelKeys = window.localStorage.getItem(FAVORITE_MODELS_STORAGE_KEY);
    if (!serializedFavoriteModelKeys) {
      return new Set();
    }
    const favoriteModelKeys = JSON.parse(serializedFavoriteModelKeys);
    if (!Array.isArray(favoriteModelKeys)) {
      return new Set();
    }
    return new Set(
      favoriteModelKeys.filter((favoriteModelKey) => typeof favoriteModelKey === "string"),
    );
  } catch {
    return new Set();
  }
}

function writeFavoriteModelKeys(favoriteModelKeys: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    FAVORITE_MODELS_STORAGE_KEY,
    JSON.stringify(Array.from(favoriteModelKeys)),
  );
}

function ProviderIcon({
  providerId,
  size,
}: {
  providerId: string;
  size: number;
}) {
  if (providerId === "claude-code") {
    return <Star size={size} />;
  }

  if (providerId === "opencode") {
    return <Terminal size={size} />;
  }

  if (providerId === "anthropic-direct") {
    return <Brain size={size} />;
  }

  if (providerId === "openai-direct") {
    return <Cpu size={size} />;
  }

  return <Box size={size} />;
}

function AgentActivityRow({
  activityMessage,
  isExpanded,
  onToggle,
}: {
  activityMessage: ActivityEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const activityDetails = createActivityDetails(activityMessage);
  const ExpandIcon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <article className="mb-1.5 min-w-0">
      <button
        type="button"
        className="grid w-full grid-cols-[minmax(0,1fr)_14px] items-center gap-1.5 rounded border border-zinc-800 bg-[#202020] px-2 py-1 text-left text-xs text-zinc-400 hover:border-zinc-700 hover:bg-[#242424] hover:text-zinc-200"
        onClick={onToggle}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ActivityIcon activityKind={activityMessage.kind} />
          <span className="truncate font-medium text-zinc-300">
            {activityDetails.title}
          </span>
        </span>
        <ExpandIcon size={12} className="text-zinc-500" />
      </button>
      {isExpanded ? (
        <pre className="mt-1 max-h-40 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] leading-4 text-zinc-300">
          <code>{activityDetails.fullText}</code>
        </pre>
      ) : null}
    </article>
  );
}

function createActivityDetails(activityMessage: ActivityEntry) {
  if (activityMessage.kind === "tool") {
    const legacyCommandMatch = activityMessage.message.match(/^Running `([\s\S]*)`$/);
    const commandText = activityMessage.detail ?? legacyCommandMatch?.[1] ?? activityMessage.message;
    const outputText = activityMessage.output?.trimEnd();
    const fullText = outputText
      ? `Command\n${commandText}\n\nOutput\n${outputText}`
      : `Command\n${commandText}`;

    return {
      title: "Running command",
      fullText,
    };
  }

  return {
    title: activityMessage.message,
    fullText: activityMessage.output
      ? `${activityMessage.message}\n\n${activityMessage.output.trimEnd()}`
      : activityMessage.detail ?? activityMessage.message,
  };
}

function TimelineFilters({
  selectedFilter,
  activityMessages,
  onSelectFilter,
}: {
  selectedFilter: TimelineFilter;
  activityMessages: ActivityEntry[];
  onSelectFilter: (timelineFilter: TimelineFilter) => void;
}) {
  const filterOptions: Array<{ value: TimelineFilter; label: string; count: number }> = [
    { value: "all", label: "All", count: activityMessages.length },
    {
      value: "thinking",
      label: "Thinking",
      count: activityMessages.filter((activityMessage) => activityMessage.kind === "thinking")
        .length,
    },
    {
      value: "tool",
      label: "Commands",
      count: activityMessages.filter((activityMessage) => activityMessage.kind === "tool").length,
    },
    {
      value: "approval",
      label: "Approvals",
      count: activityMessages.filter((activityMessage) => activityMessage.kind === "approval")
        .length,
    },
  ];

  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {filterOptions.map((filterOption) => (
        <button
          key={filterOption.value}
          type="button"
          className={`rounded border px-2 py-0.5 text-[11px] ${
            selectedFilter === filterOption.value
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
              : "border-zinc-800 bg-[#202020] text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
          }`}
          onClick={() => onSelectFilter(filterOption.value)}
        >
          {filterOption.label} {filterOption.count}
        </button>
      ))}
    </div>
  );
}

function ResponseProgressIndicator({ isStopping }: { isStopping: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
      </span>
      <span>{isStopping ? "Stopping response..." : "Codemind is still working"}</span>
    </div>
  );
}

function ResponseCompletionActions({
  changedFiles,
  canResume,
  onResume,
}: {
  changedFiles: string[];
  canResume: boolean;
  onResume: () => void;
}) {
  if (changedFiles.length === 0 && !canResume) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {changedFiles.length > 0 ? (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded border border-zinc-800 bg-[#202020] px-2 py-1 text-[11px] text-zinc-300">
          <FileCode size={12} className="shrink-0 text-emerald-300" />
          <span className="truncate">
            Changed {changedFiles.length === 1 ? changedFiles[0] : `${changedFiles.length} files`}
          </span>
        </span>
      ) : null}
      {canResume ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-[#202020] px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-700 hover:bg-[#242424] hover:text-zinc-100"
          onClick={onResume}
        >
          <RotateCcw size={12} />
          Resume
        </button>
      ) : null}
    </div>
  );
}

function ChatBubble({
  message,
  responseRunStats,
  commandCount,
  activityContent,
  footerContent,
}: {
  message: ChatMessage;
  responseRunStats?: ResponseRunStats;
  commandCount: number;
  activityContent?: ReactNode;
  footerContent?: ReactNode;
}) {
  const isUserMessage = message.role === "user";
  const elapsedTimeLabel = responseRunStats ? formatElapsedTime(responseRunStats) : null;
  return (
    <article className="mb-4 flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#242424] text-zinc-300">
        {isUserMessage ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-zinc-500">
          <span>{isUserMessage ? "You" : "Codemind"}</span>
          {!isUserMessage && elapsedTimeLabel ? (
            <span className="rounded bg-[#202020] px-1.5 py-0.5 text-[10px] font-normal text-zinc-500">
              {elapsedTimeLabel}
            </span>
          ) : null}
          {!isUserMessage ? (
            <span className="rounded bg-[#202020] px-1.5 py-0.5 text-[10px] font-normal text-zinc-500">
              {commandCount} cmd
            </span>
          ) : null}
        </div>
        {activityContent}
        {message.content.length > 0 ? (
          <MarkdownMessage content={message.content} />
        ) : null}
        {footerContent}
      </div>
    </article>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="space-y-2 text-sm leading-6 text-zinc-200">
      {blocks.map((block, blockIndex) => {
        if (block.kind === "code") {
          return (
            <pre
              key={blockIndex}
              className="max-h-72 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-300"
            >
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.kind === "heading") {
          return (
            <div
              key={blockIndex}
              className="pt-1 text-sm font-semibold leading-6 text-zinc-100"
            >
              {renderInlineMarkdown(block.content)}
            </div>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={blockIndex} className="ml-4 list-disc space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className="whitespace-pre-wrap break-words">
            {renderInlineMarkdown(block.content)}
          </p>
        );
      })}
    </div>
  );
}

type MarkdownBlock =
  | { kind: "paragraph"; content: string }
  | { kind: "heading"; content: string }
  | { kind: "code"; content: string }
  | { kind: "list"; items: string[] };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let isInCodeBlock = false;

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      blocks.push({ kind: "paragraph", content: paragraphLines.join("\n") });
      paragraphLines = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ kind: "list", items: listItems });
      listItems = [];
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (isInCodeBlock) {
        blocks.push({ kind: "code", content: codeLines.join("\n") });
        codeLines = [];
        isInCodeBlock = false;
      } else {
        flushParagraph();
        flushList();
        isInCodeBlock = true;
      }
      continue;
    }

    if (isInCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", content: headingMatch[1] });
      continue;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  if (isInCodeBlock && codeLines.length > 0) {
    blocks.push({ kind: "code", content: codeLines.join("\n") });
  }
  flushParagraph();
  flushList();

  return blocks;
}

function renderInlineMarkdown(content: string): ReactNode[] {
  const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const renderedParts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(inlinePattern)) {
    if (match.index > lastIndex) {
      renderedParts.push(content.slice(lastIndex, match.index));
    }

    const matchedText = match[0];
    if (matchedText.startsWith("`")) {
      renderedParts.push(
        <code
          key={`${match.index}:code`}
          className="rounded bg-zinc-950 px-1 py-0.5 text-[0.85em] text-zinc-100"
        >
          {matchedText.slice(1, -1)}
        </code>,
      );
    } else if (matchedText.startsWith("**")) {
      renderedParts.push(
        <strong key={`${match.index}:strong`} className="font-semibold text-zinc-100">
          {matchedText.slice(2, -2)}
        </strong>,
      );
    } else {
      const linkMatch = matchedText.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      renderedParts.push(
        <span key={`${match.index}:link`} className="text-sky-300 underline decoration-sky-500/40">
          {linkMatch?.[1] ?? matchedText}
        </span>,
      );
    }

    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < content.length) {
    renderedParts.push(content.slice(lastIndex));
  }

  return renderedParts;
}

function ActivityIcon({ activityKind }: { activityKind: ActivityEntry["kind"] }) {
  if (activityKind === "tool") {
    return <Terminal size={10} className="shrink-0 text-sky-300" />;
  }

  if (activityKind === "thinking") {
    return <Brain size={10} className="shrink-0 text-amber-200" />;
  }

  if (activityKind === "approval") {
    return <ClipboardList size={10} className="shrink-0 text-emerald-300" />;
  }

  if (activityKind === "error") {
    return <Wrench size={10} className="shrink-0 text-red-300" />;
  }

  return <Wrench size={10} className="shrink-0 text-zinc-500" />;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (toastId: string) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-50 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`pointer-events-auto rounded-md border p-3 text-left shadow-2xl ${
            toast.kind === "error"
              ? "border-red-500/40 bg-red-950/90 text-red-100"
              : toast.kind === "success"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
                : "border-sky-500/40 bg-sky-950/90 text-sky-100"
          }`}
          onClick={() => onDismiss(toast.id)}
        >
          <span className="block text-xs font-semibold">{toast.title}</span>
          {toast.description ? (
            <span className="mt-1 block max-h-12 overflow-hidden text-[11px] leading-4 opacity-80">
              {toast.description}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function filterActivityMessages(
  activityMessages: ActivityEntry[],
  timelineFilter: TimelineFilter,
): ActivityEntry[] {
  if (timelineFilter === "all") {
    return activityMessages;
  }

  return activityMessages.filter((activityMessage) => activityMessage.kind === timelineFilter);
}

function countCommandActivities(activityMessages: ActivityEntry[]): number {
  return activityMessages.filter((activityMessage) => activityMessage.kind === "tool").length;
}

function formatElapsedTime(responseRunStats: ResponseRunStats): string {
  const endTime = responseRunStats.completedAt ?? Date.now();
  const elapsedSeconds = Math.max(
    0,
    Math.round((endTime - responseRunStats.startedAt) / 1000),
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function isStoppedAssistantMessage(
  message: ChatMessage,
  activityMessages: ActivityEntry[],
): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  return (
    message.content.trim() === STOPPED_RESPONSE_TEXT ||
    activityMessages.some((activityMessage) => activityMessage.message === "Response stopped")
  );
}

function extractChangedFileNames(message: ChatMessage): string[] {
  if (message.role !== "assistant" || message.content.trim().length === 0) {
    return [];
  }

  const changedFileNames = new Set<string>();
  const markdownFilePattern = /\[[^\]]+\]\(([^)]+\.(?:tsx?|jsx?|rs|md|json|toml|css|html|yml|yaml|py|go|java|cs|cpp|c|h|hpp|sql|txt))(?:[:#][^)]+)?\)/gi;
  const plainFilePattern = /(?:^|\s)([A-Za-z]:[\\/][^\s`"')]+?\.(?:tsx?|jsx?|rs|md|json|toml|css|html|yml|yaml|py|go|java|cs|cpp|c|h|hpp|sql|txt))(?:[:#]\d+)?/gi;

  for (const match of message.content.matchAll(markdownFilePattern)) {
    changedFileNames.add(getFileNameFromPath(match[1]));
  }

  for (const match of message.content.matchAll(plainFilePattern)) {
    changedFileNames.add(getFileNameFromPath(match[1]));
  }

  return Array.from(changedFileNames).slice(0, 6);
}

function getFileNameFromPath(pathText: string): string {
  const normalizedPath = pathText.replace(/\\/g, "/");
  return normalizedPath.split("/").filter(Boolean).pop() ?? normalizedPath;
}
