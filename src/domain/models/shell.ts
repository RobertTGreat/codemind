export interface ShellCommandOutput {
  command: string;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type ShellKind = "commandPrompt" | "powerShell";
