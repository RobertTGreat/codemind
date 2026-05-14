export interface GitRepositoryStatus {
  isRepository: boolean;
  root: string | null;
  branch: string | null;
  upstream: string | null;
  remoteUrl: string | null;
  ahead: number;
  behind: number;
  hasConflicts: boolean;
  hasCommits: boolean;
  lastCommit: string | null;
  changedFiles: GitChangedFile[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
}

export interface GitChangedFile {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  workingTreeStatus: string;
  changeType: string;
  isStaged: boolean;
  isUnstaged: boolean;
  isUntracked: boolean;
  hasConflict: boolean;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  stdout: string;
  stderr: string;
}

export interface GitFileDiff {
  path: string;
  staged: boolean;
  diffText: string;
}

export interface GitFileVersion {
  path: string;
  staged: boolean;
  originalContent: string;
  modifiedContent: string;
}
