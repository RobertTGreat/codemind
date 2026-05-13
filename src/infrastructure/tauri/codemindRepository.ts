import { invoke } from "@tauri-apps/api/core";
import type { CodemindRepository } from "../../domain/ports/CodemindRepository";
import type { DiffProposal } from "../../domain/models/approval";
import type { GitOperationResult, GitRepositoryStatus } from "../../domain/models/git";
import type {
  FileTreeNode,
  ProjectFile,
  ProjectSearchResult,
} from "../../domain/models/project";
import type {
  ProviderInstallResult,
  ProviderInstallStatus,
} from "../../domain/models/providerInstall";
import type { ChatMessage, Session } from "../../domain/models/session";
import type {
  ResolvedShellDirectory,
  ShellCommandRun,
  ShellCommandOutput,
  ShellKind,
} from "../../domain/models/shell";

export const tauriCodemindRepository: CodemindRepository = {
  listSessions: () => invoke<Session[]>("list_sessions"),
  createSession: (title, agentId) =>
    invoke<Session>("create_session", { title, agentId }),
  renameSession: (sessionId, title) =>
    invoke<void>("rename_session", { sessionId, title }),
  updateSessionAgent: (sessionId, agentId) =>
    invoke<void>("update_session_agent", { sessionId, agentId }),
  archiveSession: (sessionId, isArchived) =>
    invoke<void>("archive_session", { sessionId, isArchived }),
  deleteSession: (sessionId) => invoke<void>("delete_session", { sessionId }),
  listMessages: (sessionId) =>
    invoke<ChatMessage[]>("list_messages", { sessionId }),
  sendMessage: (
    sessionId,
    content,
    model,
    reasoningEffort,
    ruleContext,
    workMode,
    approvalMode,
  ) =>
    invoke<ChatMessage[]>("send_message", {
      sessionId,
      content,
      model,
      reasoningEffort,
      ruleContext,
      workMode,
      approvalMode,
    }),
  stopMessageResponse: (sessionId) =>
    invoke<void>("stop_message_response", { sessionId }),
  setSessionProjectRoot: (sessionId, projectRoot) =>
    invoke<void>("set_session_project_root", { sessionId, projectRoot }),
  readProjectTree: (projectRoot) =>
    invoke<FileTreeNode>("read_project_tree", { projectRoot }),
  readProjectDirectory: (projectRoot, relativePath) =>
    invoke<FileTreeNode[]>("read_project_directory", { projectRoot, relativePath }),
  readProjectFile: (projectRoot, relativePath) =>
    invoke<ProjectFile>("read_project_file", { projectRoot, relativePath }),
  searchProjectFiles: (projectRoot, query) =>
    invoke<ProjectSearchResult[]>("search_project_files", { projectRoot, query }),
  saveProjectFile: (projectRoot, relativePath, content) =>
    invoke<ProjectFile>("save_project_file", { projectRoot, relativePath, content }),
  createDiffProposal: (sessionId, relativePath, proposedContent) =>
    invoke<DiffProposal>("create_diff_proposal", {
      sessionId,
      relativePath,
      proposedContent,
    }),
  listPendingDiffs: (sessionId) =>
    invoke<DiffProposal[]>("list_pending_diffs", { sessionId }),
  approveDiffProposal: (proposalId) =>
    invoke<void>("approve_diff_proposal", { proposalId }),
  rejectDiffProposal: (proposalId) =>
    invoke<void>("reject_diff_proposal", { proposalId }),
  runShellCommand: (currentDirectory, command, shellKind: ShellKind) =>
    invoke<ShellCommandOutput>("run_shell_command", {
      currentDirectory,
      command,
      shellKind,
    }),
  startShellCommand: (currentDirectory, command, shellKind: ShellKind, runId) =>
    invoke<ShellCommandRun>("start_shell_command", {
      currentDirectory,
      command,
      shellKind,
      runId,
    }),
  stopShellCommand: (runId) => invoke<void>("stop_shell_command", { runId }),
  resolveShellDirectory: (currentDirectory, requestedDirectory) =>
    invoke<ResolvedShellDirectory>("resolve_shell_directory", {
      currentDirectory,
      requestedDirectory,
    }),
  runProviderLogin: (agentId) => invoke<void>("run_provider_login", { agentId }),
  getProviderInstallStatus: (agentId) =>
    invoke<ProviderInstallStatus>("get_provider_install_status", { agentId }),
  installProvider: (agentId) =>
    invoke<ProviderInstallResult>("install_provider", { agentId }),
  installOpenVsxExtension: (extensionId, downloadUrl) =>
    invoke("install_open_vsx_extension", { extensionId, downloadUrl }),
  readGitRepositoryStatus: (projectRoot) =>
    invoke<GitRepositoryStatus>("read_git_repository_status", { projectRoot }),
  gitInitRepository: (projectRoot) =>
    invoke<GitOperationResult>("git_init_repository", { projectRoot }),
  gitSetRemote: (projectRoot, remoteUrl) =>
    invoke<GitOperationResult>("git_set_remote", { projectRoot, remoteUrl }),
  gitStagePaths: (projectRoot, paths) =>
    invoke<GitOperationResult>("git_stage_paths", { projectRoot, paths }),
  gitUnstagePaths: (projectRoot, paths) =>
    invoke<GitOperationResult>("git_unstage_paths", { projectRoot, paths }),
  gitDiscardPaths: (projectRoot, paths) =>
    invoke<GitOperationResult>("git_discard_paths", { projectRoot, paths }),
  gitCommit: (projectRoot, message) =>
    invoke<GitOperationResult>("git_commit", { projectRoot, message }),
  gitPull: (projectRoot) => invoke<GitOperationResult>("git_pull", { projectRoot }),
  gitPush: (projectRoot) => invoke<GitOperationResult>("git_push", { projectRoot }),
  gitSync: (projectRoot) => invoke<GitOperationResult>("git_sync", { projectRoot }),
};
