import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import type { GitOperationResult } from "../../domain/models/git";
import type { ProjectIndexEntry } from "../../domain/models/project";
import type { AgentActivity, ChatMessage } from "../../domain/models/session";
import { tauriCodemindRepository } from "../../infrastructure/tauri/codemindRepository";

const MESSAGE_PAGE_SIZE = 50;

export const codemindQueryKeys = {
  sessions: ["sessions"] as const,
  messages: (sessionId: string | null) => ["messages", sessionId] as const,
  messagePages: (sessionId: string | null) => ["message-pages", sessionId] as const,
  agentActivities: (sessionId: string | null, messageIdKey: string) =>
    ["agent-activities", sessionId, messageIdKey] as const,
  projectTree: (projectRoot: string | null) => ["project-tree", projectRoot] as const,
  projectDirectory: (projectRoot: string | null, relativePath: string | null) =>
    ["project-directory", projectRoot, relativePath] as const,
  projectSearch: (projectRoot: string | null, query: string) =>
    ["project-search", projectRoot, query] as const,
  projectFileIndex: (projectRoot: string | null) =>
    ["project-file-index", projectRoot] as const,
  file: (projectRoot: string | null, relativePath: string | null) =>
    ["file", projectRoot, relativePath] as const,
  pendingDiffs: (sessionId: string | null) => ["pending-diffs", sessionId] as const,
  providerInstallStatus: (agentId: string | null) =>
    ["provider-install-status", agentId] as const,
  gitStatus: (projectRoot: string | null) => ["git-status", projectRoot] as const,
  gitFileDiff: (projectRoot: string | null, path: string | null, staged: boolean) =>
    ["git-file-diff", projectRoot, path, staged] as const,
  gitFileVersion: (projectRoot: string | null, path: string | null, staged: boolean) =>
    ["git-file-version", projectRoot, path, staged] as const,
};

export function useSessions() {
  return useQuery({
    queryKey: codemindQueryKeys.sessions,
    queryFn: () => tauriCodemindRepository.listSessions(),
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, agentId }: { title: string; agentId: string }) =>
      tauriCodemindRepository.createSession(title, agentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions }),
  });
}

export function useMessages(sessionId: string | null) {
  return useQuery({
    queryKey: codemindQueryKeys.messages(sessionId),
    enabled: Boolean(sessionId),
    queryFn: () => tauriCodemindRepository.listMessages(sessionId ?? ""),
  });
}

export function useMessagePages(sessionId: string | null) {
  return useInfiniteQuery({
    queryKey: codemindQueryKeys.messagePages(sessionId),
    enabled: Boolean(sessionId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      invoke<ChatMessage[]>("list_messages_page", {
        sessionId: sessionId ?? "",
        beforeCreatedAt: pageParam,
        limit: MESSAGE_PAGE_SIZE,
      }),
    getNextPageParam: (page) =>
      page.length === MESSAGE_PAGE_SIZE ? (page[0]?.createdAt ?? undefined) : undefined,
  });
}

export function useAgentActivities(sessionId: string | null, messageIds: string[]) {
  const messageIdKey = messageIds.join("\u001f");

  return useQuery<AgentActivity[]>({
    queryKey: codemindQueryKeys.agentActivities(sessionId, messageIdKey),
    enabled: Boolean(sessionId && messageIds.length > 0),
    queryFn: () =>
      tauriCodemindRepository.listAgentActivities(sessionId ?? "", messageIds),
    staleTime: 5_000,
  });
}

export function useSendMessage(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      model,
      reasoningEffort,
      ruleContext,
      workMode,
      approvalMode,
    }: {
      content: string;
      model?: string;
      reasoningEffort?: string;
      ruleContext?: string;
      workMode?: string;
      approvalMode?: string;
    }) =>
      tauriCodemindRepository.sendMessage(
        sessionId ?? "",
        content,
        model,
        reasoningEffort,
        ruleContext,
        workMode,
        approvalMode,
      ),
    onSuccess: (messages) => {
      queryClient.setQueryData(codemindQueryKeys.messages(sessionId), messages);
      queryClient.setQueryData(codemindQueryKeys.messagePages(sessionId), {
        pages: [messages.slice(-MESSAGE_PAGE_SIZE)],
        pageParams: [null],
      });
      queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions });
      queryClient.invalidateQueries({
        queryKey: codemindQueryKeys.pendingDiffs(sessionId),
      });
    },
  });
}

export function useStopMessageResponse(sessionId: string | null) {
  return useMutation({
    mutationFn: () => tauriCodemindRepository.stopMessageResponse(sessionId ?? ""),
  });
}

export function useUpdateSessionAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, agentId }: { sessionId: string; agentId: string }) =>
      tauriCodemindRepository.updateSessionAgent(sessionId, agentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions }),
  });
}

export function useProviderInstallStatus(agentId: string | null) {
  return useQuery({
    queryKey: codemindQueryKeys.providerInstallStatus(agentId),
    enabled: agentId === "codex-cli",
    queryFn: () => tauriCodemindRepository.getProviderInstallStatus(agentId ?? ""),
  });
}

export function useInstallProvider(agentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriCodemindRepository.installProvider(agentId ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: codemindQueryKeys.providerInstallStatus(agentId),
      });
    },
  });
}

export function useSelectProjectFolder(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const selectedFolder = await open({ directory: true, multiple: false });
      if (typeof selectedFolder !== "string" || !sessionId) {
        return null;
      }
      await tauriCodemindRepository.setSessionProjectRoot(sessionId, selectedFolder);
      return selectedFolder;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: codemindQueryKeys.sessions }),
  });
}

export function useProjectTree(projectRoot: string | null) {
  return useQuery({
    queryKey: codemindQueryKeys.projectTree(projectRoot),
    enabled: Boolean(projectRoot),
    queryFn: () => tauriCodemindRepository.readProjectTree(projectRoot ?? ""),
  });
}

export function useProjectDirectory(projectRoot: string | null, relativePath: string | null) {
  return useQuery({
    queryKey: codemindQueryKeys.projectDirectory(projectRoot, relativePath),
    enabled: Boolean(projectRoot && relativePath !== null),
    queryFn: () =>
      tauriCodemindRepository.readProjectDirectory(projectRoot ?? "", relativePath ?? ""),
  });
}

export function useProjectSearch(projectRoot: string | null, query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  return useQuery({
    queryKey: codemindQueryKeys.projectSearch(projectRoot, debouncedQuery),
    enabled: Boolean(projectRoot && debouncedQuery.length >= 2),
    queryFn: () =>
      tauriCodemindRepository.searchProjectFiles(projectRoot ?? "", debouncedQuery),
    placeholderData: (previousData) => previousData,
  });
}

export function useProjectFileIndex(projectRoot: string | null) {
  return useQuery<ProjectIndexEntry[]>({
    queryKey: codemindQueryKeys.projectFileIndex(projectRoot),
    enabled: Boolean(projectRoot),
    queryFn: () => tauriCodemindRepository.listProjectFileIndex(projectRoot ?? ""),
    staleTime: 30_000,
  });
}

export function useQuickOpenResults(projectRoot: string | null, query: string) {
  const projectFileIndex = useProjectFileIndex(projectRoot);
  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (normalizedQuery.length < 2) {
      return [];
    }

    return (projectFileIndex.data ?? [])
      .map((entry) => ({
        entry,
        score: scoreQuickOpenMatch(entry.relativePath, normalizedQuery),
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 80)
      .map((result) => result.entry);
  }, [normalizedQuery, projectFileIndex.data]);

  return {
    ...projectFileIndex,
    data: results,
  };
}

export function useProjectFile(projectRoot: string | null, relativePath: string | null) {
  return useQuery({
    queryKey: codemindQueryKeys.file(projectRoot, relativePath),
    enabled: Boolean(projectRoot && relativePath),
    queryFn: () =>
      tauriCodemindRepository.readProjectFile(projectRoot ?? "", relativePath ?? ""),
  });
}

export function useSaveProjectFile(projectRoot: string | null, relativePath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      expectedVersion,
    }: {
      content: string;
      expectedVersion?: string;
    }) =>
      tauriCodemindRepository.saveProjectFile(
        projectRoot ?? "",
        relativePath ?? "",
        content,
        expectedVersion,
      ),
    onSuccess: (projectFile) => {
      queryClient.setQueryData(
        codemindQueryKeys.file(projectRoot, relativePath),
        projectFile,
      );
      invalidateProjectFileState(queryClient, projectRoot, relativePath);
    },
  });
}

export function usePendingDiffs(sessionId: string | null) {
  return useQuery({
    queryKey: codemindQueryKeys.pendingDiffs(sessionId),
    enabled: Boolean(sessionId),
    queryFn: () => tauriCodemindRepository.listPendingDiffs(sessionId ?? ""),
  });
}

export function useApproveDiff(
  sessionId: string | null,
  projectRoot: string | null = null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) =>
      tauriCodemindRepository.approveDiffProposal(proposalId),
    onSuccess: (_result, proposalId) => {
      const pendingDiffs =
        queryClient.getQueryData<Awaited<ReturnType<typeof tauriCodemindRepository.listPendingDiffs>>>(
          codemindQueryKeys.pendingDiffs(sessionId),
        ) ?? [];
      const approvedProposal = pendingDiffs.find((proposal) => proposal.id === proposalId);
      queryClient.invalidateQueries({
        queryKey: codemindQueryKeys.pendingDiffs(sessionId),
      });
      invalidateProjectFileState(
        queryClient,
        projectRoot,
        approvedProposal?.relativePath ?? null,
      );
    },
  });
}

export function useRejectDiff(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) =>
      tauriCodemindRepository.rejectDiffProposal(proposalId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: codemindQueryKeys.pendingDiffs(sessionId),
      }),
  });
}

export function useCreateDiffProposal(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      relativePath,
      proposedContent,
    }: {
      relativePath: string;
      proposedContent: string;
    }) =>
      tauriCodemindRepository.createDiffProposal(
        sessionId ?? "",
        relativePath,
        proposedContent,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: codemindQueryKeys.pendingDiffs(sessionId),
      }),
  });
}

export function useGitStatus(projectRoot: string | null, isPollingEnabled = true) {
  const isDocumentVisible = useDocumentVisibility();
  return useQuery({
    queryKey: codemindQueryKeys.gitStatus(projectRoot),
    enabled: Boolean(projectRoot && isPollingEnabled),
    queryFn: () => tauriCodemindRepository.readGitRepositoryStatus(projectRoot ?? ""),
    refetchInterval: (query) => {
      if (!isDocumentVisible) {
        return false;
      }

      const status = query.state.data;

      if (!status?.isRepository) {
        return 15_000;
      }

      if (status.changedFiles.length > 0 || status.ahead > 0 || status.behind > 0) {
        return 7_500;
      }

      return 20_000;
    },
    refetchOnWindowFocus: true,
  });
}

export function useGitFileDiff(
  projectRoot: string | null,
  path: string | null,
  staged: boolean,
) {
  return useQuery({
    queryKey: codemindQueryKeys.gitFileDiff(projectRoot, path, staged),
    enabled: Boolean(projectRoot && path),
    queryFn: () =>
      tauriCodemindRepository.gitFileDiff(projectRoot ?? "", path ?? "", staged),
    staleTime: 5_000,
  });
}

export function useGitFileVersion(
  projectRoot: string | null,
  path: string | null,
  staged: boolean,
  isEnabled: boolean,
) {
  return useQuery({
    queryKey: codemindQueryKeys.gitFileVersion(projectRoot, path, staged),
    enabled: Boolean(projectRoot && path && isEnabled),
    queryFn: () =>
      tauriCodemindRepository.gitFileVersion(projectRoot ?? "", path ?? "", staged),
    staleTime: 5_000,
  });
}

export function useGitInitRepository(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriCodemindRepository.gitInitRepository(projectRoot ?? ""),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitSetRemote(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (remoteUrl: string) =>
      tauriCodemindRepository.gitSetRemote(projectRoot ?? "", remoteUrl),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitStagePaths(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      tauriCodemindRepository.gitStagePaths(projectRoot ?? "", paths),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitUnstagePaths(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      tauriCodemindRepository.gitUnstagePaths(projectRoot ?? "", paths),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitDiscardPaths(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      tauriCodemindRepository.gitDiscardPaths(projectRoot ?? "", paths),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitCommit(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      tauriCodemindRepository.gitCommit(projectRoot ?? "", message),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitPull(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriCodemindRepository.gitPull(projectRoot ?? ""),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitPush(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriCodemindRepository.gitPush(projectRoot ?? ""),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

export function useGitSync(projectRoot: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tauriCodemindRepository.gitSync(projectRoot ?? ""),
    onSuccess: () => invalidateGitProjectState(queryClient, projectRoot),
  });
}

function invalidateGitProjectState(queryClient: QueryClient, projectRoot: string | null) {
  queryClient.invalidateQueries({ queryKey: codemindQueryKeys.gitStatus(projectRoot) });
  queryClient.invalidateQueries({
    queryKey: ["git-file-diff", projectRoot],
    exact: false,
  });
  queryClient.invalidateQueries({
    queryKey: ["git-file-version", projectRoot],
    exact: false,
  });
  queryClient.invalidateQueries({ queryKey: codemindQueryKeys.projectTree(projectRoot) });
  queryClient.invalidateQueries({ queryKey: codemindQueryKeys.projectFileIndex(projectRoot) });
}

function invalidateProjectFileState(
  queryClient: QueryClient,
  projectRoot: string | null,
  relativePath: string | null,
) {
  queryClient.invalidateQueries({ queryKey: codemindQueryKeys.projectTree(projectRoot) });
  queryClient.invalidateQueries({ queryKey: codemindQueryKeys.projectFileIndex(projectRoot) });
  queryClient.invalidateQueries({
    queryKey: ["project-directory", projectRoot],
    exact: false,
  });
  queryClient.invalidateQueries({ queryKey: codemindQueryKeys.gitStatus(projectRoot) });
  queryClient.invalidateQueries({
    queryKey: ["git-file-version", projectRoot],
    exact: false,
  });
  if (relativePath) {
    queryClient.invalidateQueries({
      queryKey: codemindQueryKeys.file(projectRoot, relativePath),
    });
  }
}

function useDebouncedValue(value: string, delayInMilliseconds: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayInMilliseconds);

    return () => window.clearTimeout(timeoutId);
  }, [delayInMilliseconds, value]);

  return debouncedValue;
}

function scoreQuickOpenMatch(relativePath: string, query: string): number {
  const normalizedPath = relativePath.toLowerCase();

  if (normalizedPath === query) {
    return 10_000;
  }

  if (normalizedPath.endsWith(`/${query}`)) {
    return 5_000 - normalizedPath.length;
  }

  if (normalizedPath.includes(query)) {
    return 2_000 - normalizedPath.indexOf(query);
  }

  let score = 0;
  let queryIndex = 0;

  for (let pathIndex = 0; pathIndex < normalizedPath.length; pathIndex += 1) {
    if (normalizedPath[pathIndex] === query[queryIndex]) {
      score += 10;
      queryIndex += 1;

      if (queryIndex === query.length) {
        return score - normalizedPath.length;
      }
    }
  }

  return 0;
}

function useDocumentVisibility() {
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => {
    if (typeof document === "undefined") {
      return true;
    }
    return document.visibilityState === "visible";
  });

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return isDocumentVisible;
}

export function getGitOperationErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Git operation failed.";
}

export function getGitOperationOutput(gitOperationResult: GitOperationResult) {
  const outputParts = [gitOperationResult.stdout, gitOperationResult.stderr]
    .map((outputPart) => outputPart.trim())
    .filter(Boolean);

  return outputParts.join("\n");
}
