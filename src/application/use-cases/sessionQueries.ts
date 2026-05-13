import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import type { GitOperationResult } from "../../domain/models/git";
import { tauriCodemindRepository } from "../../infrastructure/tauri/codemindRepository";

export const codemindQueryKeys = {
  sessions: ["sessions"] as const,
  messages: (sessionId: string | null) => ["messages", sessionId] as const,
  projectTree: (projectRoot: string | null) => ["project-tree", projectRoot] as const,
  projectDirectory: (projectRoot: string | null, relativePath: string | null) =>
    ["project-directory", projectRoot, relativePath] as const,
  projectSearch: (projectRoot: string | null, query: string) =>
    ["project-search", projectRoot, query] as const,
  file: (projectRoot: string | null, relativePath: string | null) =>
    ["file", projectRoot, relativePath] as const,
  pendingDiffs: (sessionId: string | null) => ["pending-diffs", sessionId] as const,
  providerInstallStatus: (agentId: string | null) =>
    ["provider-install-status", agentId] as const,
  gitStatus: (projectRoot: string | null) => ["git-status", projectRoot] as const,
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
  return useQuery({
    queryKey: codemindQueryKeys.projectSearch(projectRoot, query),
    enabled: Boolean(projectRoot && query.trim().length > 0),
    queryFn: () => tauriCodemindRepository.searchProjectFiles(projectRoot ?? "", query),
  });
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
    mutationFn: (content: string) =>
      tauriCodemindRepository.saveProjectFile(
        projectRoot ?? "",
        relativePath ?? "",
        content,
      ),
    onSuccess: (projectFile) => {
      queryClient.setQueryData(
        codemindQueryKeys.file(projectRoot, relativePath),
        projectFile,
      );
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

export function useApproveDiff(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) =>
      tauriCodemindRepository.approveDiffProposal(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: codemindQueryKeys.pendingDiffs(sessionId),
      });
      queryClient.invalidateQueries();
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

export function useGitStatus(projectRoot: string | null) {
  return useQuery({
    queryKey: codemindQueryKeys.gitStatus(projectRoot),
    enabled: Boolean(projectRoot),
    queryFn: () => tauriCodemindRepository.readGitRepositoryStatus(projectRoot ?? ""),
    refetchInterval: 5_000,
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
  queryClient.invalidateQueries({ queryKey: codemindQueryKeys.projectTree(projectRoot) });
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
