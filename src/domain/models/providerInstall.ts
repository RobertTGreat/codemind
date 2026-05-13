export interface ProviderInstallStatus {
  providerId: string;
  isInstalled: boolean;
  executablePath: string | null;
  installCommand: string;
}

export interface ProviderInstallResult extends ProviderInstallStatus {
  stdout: string;
  stderr: string;
}
