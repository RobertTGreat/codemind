export interface ProviderInstallStatus {
  providerId: string;
  isInstalled: boolean;
  isAuthenticated: boolean;
  executablePath: string | null;
  installCommand: string;
  authenticationStatus: string | null;
}

export interface ProviderInstallResult extends ProviderInstallStatus {
  stdout: string;
  stderr: string;
}
