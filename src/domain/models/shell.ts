export interface ShellCommandOutput {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ShellCommandRun {
  runId: string;
  command: string;
  cwd: string;
}

export interface ShellOutputEvent {
  runId: string;
  stream: "stdout" | "stderr" | "status";
  chunk: string;
  exitCode: number | null;
  cwd: string;
  isComplete: boolean;
}

export interface ResolvedShellDirectory {
  cwd: string;
}

export type ShellKind = "commandPrompt" | "powerShell";
