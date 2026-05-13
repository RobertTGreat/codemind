import type { DiffProposal } from "../models/approval";
import type { ExtensionInstallResult } from "../models/extension";
import type { GitOperationResult, GitRepositoryStatus } from "../models/git";
import type { FileTreeNode, ProjectFile, ProjectSearchResult } from "../models/project";
import type {
  ProviderInstallResult,
  ProviderInstallStatus,
} from "../models/providerInstall";
import type { ChatMessage, Session } from "../models/session";
import type {
  ResolvedShellDirectory,
  ShellCommandRun,
  ShellCommandOutput,
  ShellKind,
} from "../models/shell";

export interface CodemindRepository {
  listSessions(): Promise<Session[]>;
  createSession(title: string, agentId: string): Promise<Session>;
  renameSession(sessionId: string, title: string): Promise<void>;
  updateSessionAgent(sessionId: string, agentId: string): Promise<void>;
  archiveSession(sessionId: string, isArchived: boolean): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listMessages(sessionId: string): Promise<ChatMessage[]>;
  sendMessage(
    sessionId: string,
    content: string,
    model?: string,
    reasoningEffort?: string,
    ruleContext?: string,
    workMode?: string,
    approvalMode?: string,
  ): Promise<ChatMessage[]>;
  stopMessageResponse(sessionId: string): Promise<void>;
  setSessionProjectRoot(sessionId: string, projectRoot: string): Promise<void>;
  readProjectTree(projectRoot: string): Promise<FileTreeNode>;
  readProjectDirectory(
    projectRoot: string,
    relativePath: string,
  ): Promise<FileTreeNode[]>;
  readProjectFile(projectRoot: string, relativePath: string): Promise<ProjectFile>;
  searchProjectFiles(projectRoot: string, query: string): Promise<ProjectSearchResult[]>;
  saveProjectFile(
    projectRoot: string,
    relativePath: string,
    content: string,
  ): Promise<ProjectFile>;
  createDiffProposal(
    sessionId: string,
    relativePath: string,
    proposedContent: string,
  ): Promise<DiffProposal>;
  listPendingDiffs(sessionId: string): Promise<DiffProposal[]>;
  approveDiffProposal(proposalId: string): Promise<void>;
  rejectDiffProposal(proposalId: string): Promise<void>;
  runShellCommand(
    currentDirectory: string | null,
    command: string,
    shellKind: ShellKind,
  ): Promise<ShellCommandOutput>;
  startShellCommand(
    currentDirectory: string | null,
    command: string,
    shellKind: ShellKind,
    runId: string,
  ): Promise<ShellCommandRun>;
  stopShellCommand(runId: string): Promise<void>;
  resolveShellDirectory(
    currentDirectory: string | null,
    requestedDirectory: string,
  ): Promise<ResolvedShellDirectory>;
  runProviderLogin(agentId: string): Promise<void>;
  getProviderInstallStatus(agentId: string): Promise<ProviderInstallStatus>;
  installProvider(agentId: string): Promise<ProviderInstallResult>;
  installOpenVsxExtension(
    extensionId: string,
    downloadUrl: string,
  ): Promise<ExtensionInstallResult>;
  readGitRepositoryStatus(projectRoot: string): Promise<GitRepositoryStatus>;
  gitInitRepository(projectRoot: string): Promise<GitOperationResult>;
  gitSetRemote(projectRoot: string, remoteUrl: string): Promise<GitOperationResult>;
  gitStagePaths(projectRoot: string, paths: string[]): Promise<GitOperationResult>;
  gitUnstagePaths(projectRoot: string, paths: string[]): Promise<GitOperationResult>;
  gitDiscardPaths(projectRoot: string, paths: string[]): Promise<GitOperationResult>;
  gitCommit(projectRoot: string, message: string): Promise<GitOperationResult>;
  gitPull(projectRoot: string): Promise<GitOperationResult>;
  gitPush(projectRoot: string): Promise<GitOperationResult>;
  gitSync(projectRoot: string): Promise<GitOperationResult>;
}
