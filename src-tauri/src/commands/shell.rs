use crate::services::cli;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Emitter};
use url::Url;
use uuid::Uuid;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const MAX_VSIX_DOWNLOAD_BYTES: u64 = 100 * 1024 * 1024;
const SHELL_OUTPUT_EVENT_NAME: &str = "shell-output";

static ACTIVE_SHELL_RUNS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ShellKind {
    CommandPrompt,
    PowerShell,
    GitBash,
    Sh,
    Bash,
    Zsh,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellCommandOutput {
    pub command: String,
    pub cwd: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellCommandRun {
    pub run_id: String,
    pub command: String,
    pub cwd: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellOutputEvent {
    pub run_id: String,
    pub stream: String,
    pub chunk: String,
    pub exit_code: Option<i32>,
    pub cwd: String,
    pub is_complete: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedShellDirectory {
    pub cwd: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInstallResult {
    pub installed_with: String,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInstallStatus {
    pub provider_id: String,
    pub is_installed: bool,
    pub is_authenticated: bool,
    pub executable_path: Option<String>,
    pub install_command: String,
    pub authentication_status: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInstallResult {
    pub provider_id: String,
    pub is_installed: bool,
    pub is_authenticated: bool,
    pub executable_path: Option<String>,
    pub install_command: String,
    pub authentication_status: Option<String>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone)]
struct EditorInstallCommand {
    display_name: &'static str,
    executable_path: PathBuf,
}

struct EditorCliDefinition {
    display_name: &'static str,
    path_command_name: &'static str,
    windows_install_paths: &'static [&'static str],
}

const EDITOR_CLI_DEFINITIONS: &[EditorCliDefinition] = &[
    EditorCliDefinition {
        display_name: "VS Code",
        path_command_name: "code",
        windows_install_paths: &["Microsoft VS Code\\bin\\code.cmd"],
    },
    EditorCliDefinition {
        display_name: "VS Code Insiders",
        path_command_name: "code-insiders",
        windows_install_paths: &["Microsoft VS Code Insiders\\bin\\code-insiders.cmd"],
    },
    EditorCliDefinition {
        display_name: "VSCodium",
        path_command_name: "codium",
        windows_install_paths: &["VSCodium\\bin\\codium.cmd"],
    },
    EditorCliDefinition {
        display_name: "Cursor",
        path_command_name: "cursor",
        windows_install_paths: &[
            "Cursor\\resources\\app\\bin\\cursor.cmd",
            "cursor\\resources\\app\\bin\\cursor.cmd",
        ],
    },
    EditorCliDefinition {
        display_name: "Windsurf",
        path_command_name: "windsurf",
        windows_install_paths: &["Windsurf\\resources\\app\\bin\\windsurf.cmd"],
    },
    EditorCliDefinition {
        display_name: "Trae",
        path_command_name: "trae",
        windows_install_paths: &["Trae\\resources\\app\\bin\\trae.cmd"],
    },
    EditorCliDefinition {
        display_name: "Antigravity",
        path_command_name: "antigravity",
        windows_install_paths: &["Antigravity\\bin\\antigravity.cmd"],
    },
];

#[tauri::command]
pub fn run_shell_command(
    current_directory: Option<String>,
    command: String,
    shell_kind: ShellKind,
) -> Result<ShellCommandOutput, String> {
    let trimmed_command = command.trim();
    if trimmed_command.is_empty() {
        return Err("command cannot be empty".to_string());
    }

    let working_directory = match current_directory {
        Some(root) if !root.trim().is_empty() => {
            fs::canonicalize(root).map_err(|error| error.to_string())?
        }
        _ => std::env::current_dir().map_err(|error| error.to_string())?,
    };

    let output = create_shell_command(&shell_kind, trimmed_command, &working_directory)
        .output()
        .map_err(|error| error.to_string())?;

    Ok(ShellCommandOutput {
        command: trimmed_command.to_string(),
        cwd: working_directory.to_string_lossy().to_string(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[tauri::command]
pub fn start_shell_command(
    app_handle: AppHandle,
    current_directory: Option<String>,
    command: String,
    shell_kind: ShellKind,
    run_id: String,
) -> Result<ShellCommandRun, String> {
    let trimmed_command = command.trim();
    if trimmed_command.is_empty() {
        return Err("command cannot be empty".to_string());
    }
    if run_id.trim().is_empty() {
        return Err("run id cannot be empty".to_string());
    }

    let working_directory = resolve_working_directory(current_directory)?;
    let working_directory_text = working_directory.to_string_lossy().to_string();
    let command_text = trimmed_command.to_string();
    let thread_run_id = run_id.clone();
    let thread_command_text = command_text.clone();
    let thread_working_directory = working_directory.clone();

    std::thread::spawn(move || {
        let mut shell_command =
            create_shell_command(&shell_kind, &thread_command_text, &thread_working_directory);
        shell_command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_streaming_shell_process(&mut shell_command);

        let spawn_result = shell_command.spawn();
        let mut child = match spawn_result {
            Ok(child) => child,
            Err(error) => {
                emit_shell_output(
                    &app_handle,
                    ShellOutputEvent {
                        run_id: thread_run_id,
                        stream: "stderr".to_string(),
                        chunk: error.to_string(),
                        exit_code: Some(1),
                        cwd: thread_working_directory.to_string_lossy().to_string(),
                        is_complete: true,
                    },
                );
                return;
            }
        };

        register_shell_run(&thread_run_id, child.id());

        let stdout_handle = child.stdout.take().map(|stdout| {
            let output_app_handle = app_handle.clone();
            let output_run_id = thread_run_id.clone();
            let output_cwd = thread_working_directory.to_string_lossy().to_string();
            std::thread::spawn(move || {
                stream_shell_output(
                    output_app_handle,
                    output_run_id,
                    output_cwd,
                    "stdout",
                    stdout,
                );
            })
        });

        let stderr_handle = child.stderr.take().map(|stderr| {
            let output_app_handle = app_handle.clone();
            let output_run_id = thread_run_id.clone();
            let output_cwd = thread_working_directory.to_string_lossy().to_string();
            std::thread::spawn(move || {
                stream_shell_output(
                    output_app_handle,
                    output_run_id,
                    output_cwd,
                    "stderr",
                    stderr,
                );
            })
        });

        let exit_code = child.wait().ok().and_then(|status| status.code());
        if let Some(handle) = stdout_handle {
            let _ = handle.join();
        }
        if let Some(handle) = stderr_handle {
            let _ = handle.join();
        }
        unregister_shell_run(&thread_run_id);

        emit_shell_output(
            &app_handle,
            ShellOutputEvent {
                run_id: thread_run_id,
                stream: "status".to_string(),
                chunk: String::new(),
                exit_code,
                cwd: thread_working_directory.to_string_lossy().to_string(),
                is_complete: true,
            },
        );
    });

    Ok(ShellCommandRun {
        run_id,
        command: command_text,
        cwd: working_directory_text,
    })
}

#[tauri::command]
pub fn stop_shell_command(run_id: String) -> Result<(), String> {
    let process_id = unregister_shell_run(&run_id)
        .ok_or_else(|| "shell command is no longer running".to_string())?;
    kill_shell_process_tree(process_id)
}

#[tauri::command]
pub fn resolve_shell_directory(
    current_directory: Option<String>,
    requested_directory: String,
) -> Result<ResolvedShellDirectory, String> {
    let base_directory = resolve_working_directory(current_directory)?;
    let requested_directory = unquote_shell_path(requested_directory.trim());
    let requested_directory = expand_home_directory(&requested_directory);
    let candidate_directory = if requested_directory.is_empty() || requested_directory == "." {
        base_directory
    } else {
        let requested_path = PathBuf::from(&requested_directory);
        if requested_path.is_absolute() {
            requested_path
        } else {
            base_directory.join(requested_path)
        }
    };
    let canonical_directory =
        fs::canonicalize(candidate_directory).map_err(|error| error.to_string())?;
    if !canonical_directory.is_dir() {
        return Err("target path is not a directory".to_string());
    }

    Ok(ResolvedShellDirectory {
        cwd: canonical_directory.to_string_lossy().to_string(),
    })
}

fn resolve_working_directory(current_directory: Option<String>) -> Result<PathBuf, String> {
    match current_directory {
        Some(directory) if !directory.trim().is_empty() => {
            fs::canonicalize(directory).map_err(|error| error.to_string())
        }
        _ => std::env::current_dir().map_err(|error| error.to_string()),
    }
}

#[tauri::command]
pub fn run_provider_login(agent_id: String) -> Result<(), String> {
    if agent_id != "codex-cli" {
        return Err("login is currently available for Codex CLI only".to_string());
    }

    let codex_executable = cli::resolve_codex_executable()?;
    let mut login_command = codex_executable.create_command();
    login_command.arg("login");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        login_command.creation_flags(CREATE_NO_WINDOW);
    }

    login_command.spawn().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_provider_install_status(agent_id: String) -> Result<ProviderInstallStatus, String> {
    require_codex_agent(&agent_id)?;
    Ok(create_codex_install_status(agent_id))
}

#[tauri::command]
pub fn install_provider(agent_id: String) -> Result<ProviderInstallResult, String> {
    require_codex_agent(&agent_id)?;

    let working_directory = std::env::temp_dir();
    let install_output = create_shell_command(
        &ShellKind::CommandPrompt,
        cli::CODEX_CLI_INSTALL_COMMAND,
        &working_directory,
    )
    .output()
    .map_err(|error| format!("failed to start Codex CLI installer: {error}"))?;

    let stdout = String::from_utf8_lossy(&install_output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&install_output.stderr).to_string();
    if !install_output.status.success() {
        let installer_error = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        return Err(if installer_error.is_empty() {
            "Codex CLI installer failed without output.".to_string()
        } else {
            installer_error
        });
    }

    let install_status = create_codex_install_status(agent_id.clone());
    if !install_status.is_installed {
        return Err(format!(
            "Codex CLI install finished, but Codemind could not find `codex` on PATH. Restart Codemind or add the npm global bin folder to PATH, then run `{}` again if needed.",
            cli::CODEX_CLI_INSTALL_COMMAND
        ));
    }

    Ok(ProviderInstallResult {
        provider_id: agent_id,
        is_installed: install_status.is_installed,
        is_authenticated: install_status.is_authenticated,
        executable_path: install_status.executable_path,
        install_command: install_status.install_command,
        authentication_status: install_status.authentication_status,
        stdout,
        stderr,
    })
}

#[tauri::command]
pub fn install_open_vsx_extension(
    extension_id: String,
    download_url: String,
) -> Result<ExtensionInstallResult, String> {
    if extension_id.trim().is_empty() {
        return Err("extension id cannot be empty".to_string());
    }

    validate_open_vsx_download_url(&download_url)?;

    let vsix_path = std::env::temp_dir().join(format!(
        "codemind-openvsx-{}-{}.vsix",
        sanitize_file_name(&extension_id),
        Uuid::new_v4()
    ));
    download_file(&download_url, &vsix_path)?;

    let install_result = install_vsix_with_available_editor(&vsix_path);
    let _ = fs::remove_file(&vsix_path);
    install_result
}

fn require_codex_agent(agent_id: &str) -> Result<(), String> {
    if agent_id == "codex-cli" {
        Ok(())
    } else {
        Err("installation is currently available for Codex CLI only".to_string())
    }
}

fn create_codex_install_status(agent_id: String) -> ProviderInstallStatus {
    match cli::resolve_codex_executable() {
        Ok(codex_executable) => {
            let login_status = cli::read_codex_login_status(&codex_executable);
            ProviderInstallStatus {
                provider_id: agent_id,
                is_installed: true,
                is_authenticated: login_status.is_authenticated,
                executable_path: Some(
                    codex_executable
                        .executable_path()
                        .to_string_lossy()
                        .to_string(),
                ),
                install_command: cli::CODEX_CLI_INSTALL_COMMAND.to_string(),
                authentication_status: Some(login_status.status_text),
            }
        }
        Err(_) => ProviderInstallStatus {
            provider_id: agent_id,
            is_installed: false,
            is_authenticated: false,
            executable_path: None,
            install_command: cli::CODEX_CLI_INSTALL_COMMAND.to_string(),
            authentication_status: None,
        },
    }
}

fn create_shell_command(
    shell_kind: &ShellKind,
    command: &str,
    working_directory: &PathBuf,
) -> Command {
    if cfg!(target_os = "windows") {
        match shell_kind {
            ShellKind::CommandPrompt => {
                let mut shell_command = Command::new("cmd");
                shell_command
                    .args(["/D", "/C", command])
                    .current_dir(working_directory);
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    shell_command.creation_flags(CREATE_NO_WINDOW);
                }
                shell_command
            }
            ShellKind::GitBash => {
                let mut shell_command = Command::new(resolve_git_bash_executable());
                shell_command
                    .args(["-lc", command])
                    .current_dir(working_directory);
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    shell_command.creation_flags(CREATE_NO_WINDOW);
                }
                shell_command
            }
            ShellKind::PowerShell | ShellKind::Sh | ShellKind::Bash | ShellKind::Zsh => {
                let mut shell_command = Command::new("powershell");
                shell_command
                    .args(["-NoLogo", "-NoProfile", "-Command", command])
                    .current_dir(working_directory);
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    shell_command.creation_flags(CREATE_NO_WINDOW);
                }
                shell_command
            }
        }
    } else {
        let executable = match shell_kind {
            ShellKind::Bash | ShellKind::GitBash => "bash",
            ShellKind::Zsh => "zsh",
            ShellKind::CommandPrompt | ShellKind::PowerShell | ShellKind::Sh => "sh",
        };

        let mut shell_command = Command::new(executable);
        shell_command
            .args(["-lc", command])
            .current_dir(working_directory);
        shell_command
    }
}

#[cfg(target_os = "windows")]
fn resolve_git_bash_executable() -> PathBuf {
    ["PROGRAMFILES", "PROGRAMFILES(X86)"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .map(|root| root.join("Git").join("bin").join("bash.exe"))
        .find(|candidate_path| candidate_path.is_file())
        .or_else(|| find_commands_on_path("bash").into_iter().next())
        .unwrap_or_else(|| PathBuf::from("bash"))
}

#[cfg(not(target_os = "windows"))]
fn resolve_git_bash_executable() -> PathBuf {
    PathBuf::from("bash")
}

fn configure_streaming_shell_process(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        let _ = command;
    }

    #[cfg(not(target_os = "windows"))]
    unsafe {
        use std::os::unix::process::CommandExt;
        command.pre_exec(|| {
            if libc::setpgid(0, 0) == 0 {
                Ok(())
            } else {
                Err(std::io::Error::last_os_error())
            }
        });
    }
}

fn stream_shell_output<R: Read>(
    app_handle: AppHandle,
    run_id: String,
    cwd: String,
    stream: &'static str,
    mut output_reader: R,
) {
    let mut output_buffer = [0_u8; 8192];
    loop {
        match output_reader.read(&mut output_buffer) {
            Ok(0) => break,
            Ok(byte_count) => emit_shell_output(
                &app_handle,
                ShellOutputEvent {
                    run_id: run_id.clone(),
                    stream: stream.to_string(),
                    chunk: String::from_utf8_lossy(&output_buffer[..byte_count]).to_string(),
                    exit_code: None,
                    cwd: cwd.clone(),
                    is_complete: false,
                },
            ),
            Err(error) => {
                emit_shell_output(
                    &app_handle,
                    ShellOutputEvent {
                        run_id: run_id.clone(),
                        stream: "stderr".to_string(),
                        chunk: error.to_string(),
                        exit_code: None,
                        cwd: cwd.clone(),
                        is_complete: false,
                    },
                );
                break;
            }
        }
    }
}

fn emit_shell_output(app_handle: &AppHandle, event: ShellOutputEvent) {
    let _ = app_handle.emit(SHELL_OUTPUT_EVENT_NAME, event);
}

fn register_shell_run(run_id: &str, process_id: u32) {
    if let Ok(mut active_shell_runs) = active_shell_runs().lock() {
        active_shell_runs.insert(run_id.to_string(), process_id);
    }
}

fn unregister_shell_run(run_id: &str) -> Option<u32> {
    active_shell_runs()
        .lock()
        .ok()
        .and_then(|mut active_shell_runs| active_shell_runs.remove(run_id))
}

fn active_shell_runs() -> &'static Mutex<HashMap<String, u32>> {
    ACTIVE_SHELL_RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(target_os = "windows")]
fn kill_shell_process_tree(process_id: u32) -> Result<(), String> {
    let status = Command::new("taskkill")
        .args(["/PID", &process_id.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| error.to_string())?;

    status
        .success()
        .then_some(())
        .ok_or_else(|| format!("failed to stop process {process_id}"))
}

#[cfg(not(target_os = "windows"))]
fn kill_shell_process_tree(process_id: u32) -> Result<(), String> {
    let process_group_id = format!("-{process_id}");
    let terminate_status = Command::new("kill")
        .args(["-TERM", "--", &process_group_id])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|error| error.to_string())?;

    if terminate_status.success() {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let _ = Command::new("kill")
            .args(["-KILL", "--", &process_group_id])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        return Ok(());
    }

    Err(format!("failed to stop process group for pid {process_id}"))
}

fn download_file(download_url: &str, output_path: &Path) -> Result<(), String> {
    let mut download_command = if cfg!(target_os = "windows") {
        let download_script = format!(
            "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri {} -OutFile {}",
            quote_powershell_string(download_url),
            quote_powershell_string(&output_path.to_string_lossy())
        );
        let mut command = Command::new("powershell");
        command.args(["-NoLogo", "-NoProfile", "-Command", &download_script]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        command
    } else {
        let mut command = Command::new("curl");
        command.args([
            "-L",
            "--max-filesize",
            &MAX_VSIX_DOWNLOAD_BYTES.to_string(),
            download_url,
            "-o",
            &output_path.to_string_lossy(),
        ]);
        command
    };

    let output = download_command
        .output()
        .map_err(|error| format!("failed to start VSIX download: {error}"))?;

    if output.status.success() {
        let downloaded_file_size = fs::metadata(output_path)
            .map_err(|error| format!("failed to inspect downloaded VSIX: {error}"))?
            .len();
        if downloaded_file_size > MAX_VSIX_DOWNLOAD_BYTES {
            let _ = fs::remove_file(output_path);
            return Err("downloaded VSIX is too large".to_string());
        }
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "failed to download VSIX from Open VSX".to_string()
        } else {
            stderr
        })
    }
}

fn validate_open_vsx_download_url(download_url: &str) -> Result<(), String> {
    let parsed_url =
        Url::parse(download_url).map_err(|_| "Open VSX download URL is invalid".to_string())?;
    if parsed_url.scheme() != "https" || parsed_url.host_str() != Some("open-vsx.org") {
        return Err("only HTTPS downloads from open-vsx.org are supported".to_string());
    }
    if !parsed_url.username().is_empty() || parsed_url.password().is_some() {
        return Err("Open VSX download URL cannot include credentials".to_string());
    }
    Ok(())
}

fn unquote_shell_path(value: &str) -> String {
    let trimmed_value = value.trim();
    if trimmed_value.len() >= 2 {
        let first_character = trimmed_value.chars().next();
        let last_character = trimmed_value.chars().last();
        if matches!(
            (first_character, last_character),
            (Some('\''), Some('\'')) | (Some('"'), Some('"'))
        ) {
            return trimmed_value[1..trimmed_value.len() - 1].to_string();
        }
    }
    trimmed_value.to_string()
}

fn expand_home_directory(requested_directory: &str) -> String {
    if requested_directory != "~"
        && !requested_directory.starts_with("~/")
        && !requested_directory.starts_with("~\\")
    {
        return requested_directory.to_string();
    }

    let Some(home_directory) = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
    else {
        return requested_directory.to_string();
    };

    if requested_directory == "~" {
        home_directory.to_string_lossy().to_string()
    } else {
        home_directory
            .join(
                requested_directory
                    .trim_start_matches("~/")
                    .trim_start_matches("~\\"),
            )
            .to_string_lossy()
            .to_string()
    }
}

fn install_vsix_with_available_editor(vsix_path: &Path) -> Result<ExtensionInstallResult, String> {
    let editor_install_commands = find_editor_install_commands();
    if editor_install_commands.is_empty() {
        return Err(format!(
            "could not find a supported editor CLI. Looked for: {}",
            supported_editor_names().join(", ")
        ));
    }

    let mut attempts = Vec::new();

    for editor_command in editor_install_commands {
        let mut install_command = create_editor_install_command(&editor_command, vsix_path);

        let output = match install_command.output() {
            Ok(output) => output,
            Err(error) => {
                attempts.push(format!(
                    "{}: {error}",
                    format_editor_attempt(&editor_command)
                ));
                continue;
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if output.status.success() {
            return Ok(ExtensionInstallResult {
                installed_with: editor_command.display_name.to_string(),
                stdout,
                stderr,
            });
        }

        attempts.push(format!(
            "{}: {}",
            format_editor_attempt(&editor_command),
            if stderr.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                stderr.trim().to_string()
            }
        ));
    }

    Err(format!(
        "could not install VSIX with a supported editor CLI. Tried: {}",
        attempts.join("; ")
    ))
}

fn create_editor_install_command(
    editor_command: &EditorInstallCommand,
    vsix_path: &Path,
) -> Command {
    let mut install_command = if is_windows_batch_file(&editor_command.executable_path) {
        let mut command = Command::new("cmd");
        command.arg("/C").arg(&editor_command.executable_path);
        command
    } else {
        Command::new(&editor_command.executable_path)
    };

    install_command
        .arg("--install-extension")
        .arg(vsix_path)
        .arg("--force");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        install_command.creation_flags(CREATE_NO_WINDOW);
    }

    install_command
}

fn find_editor_install_commands() -> Vec<EditorInstallCommand> {
    let mut install_commands = Vec::new();
    let mut seen_paths = HashSet::new();

    for editor_definition in EDITOR_CLI_DEFINITIONS {
        for executable_path in find_editor_paths(editor_definition) {
            let normalized_path = executable_path.to_string_lossy().to_ascii_lowercase();
            if seen_paths.insert(normalized_path) {
                install_commands.push(EditorInstallCommand {
                    display_name: editor_definition.display_name,
                    executable_path,
                });
            }
        }
    }

    install_commands
}

fn find_editor_paths(editor_definition: &EditorCliDefinition) -> Vec<PathBuf> {
    let mut editor_paths = find_commands_on_path(editor_definition.path_command_name);

    if cfg!(target_os = "windows") {
        for install_root in windows_editor_install_roots() {
            for relative_install_path in editor_definition.windows_install_paths {
                let candidate_path = install_root.join(relative_install_path);
                if candidate_path.is_file() {
                    editor_paths.push(candidate_path);
                }
            }
        }
    }

    editor_paths
}

fn find_commands_on_path(command_name: &str) -> Vec<PathBuf> {
    let Some(path_value) = std::env::var_os("PATH") else {
        return Vec::new();
    };

    let candidate_file_names = executable_file_names(command_name);
    std::env::split_paths(&path_value)
        .flat_map(|path_directory| {
            candidate_file_names
                .iter()
                .map(move |file_name| path_directory.join(file_name))
        })
        .filter(|candidate_path| candidate_path.is_file())
        .collect()
}

fn executable_file_names(command_name: &str) -> Vec<String> {
    if !cfg!(target_os = "windows") || Path::new(command_name).extension().is_some() {
        return vec![command_name.to_string()];
    }

    let mut candidate_file_names = Vec::new();
    let path_extensions = std::env::var_os("PATHEXT")
        .and_then(|value| value.into_string().ok())
        .unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".to_string());

    for path_extension in path_extensions.split(';') {
        let trimmed_extension = path_extension.trim();
        if trimmed_extension.is_empty() {
            continue;
        }

        candidate_file_names.push(format!(
            "{command_name}{}",
            trimmed_extension.to_ascii_lowercase()
        ));
    }

    candidate_file_names.push(command_name.to_string());
    candidate_file_names
}

fn windows_editor_install_roots() -> Vec<PathBuf> {
    ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(|root| {
            if root.to_string_lossy().ends_with("\\Programs") {
                PathBuf::from(root)
            } else if root
                .to_string_lossy()
                .to_ascii_lowercase()
                .contains("\\appdata\\local")
            {
                PathBuf::from(root).join("Programs")
            } else {
                PathBuf::from(root)
            }
        })
        .collect()
}

fn is_windows_batch_file(executable_path: &Path) -> bool {
    cfg!(target_os = "windows")
        && executable_path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
            })
}

fn supported_editor_names() -> Vec<&'static str> {
    EDITOR_CLI_DEFINITIONS
        .iter()
        .map(|editor_definition| editor_definition.path_command_name)
        .collect()
}

fn format_editor_attempt(editor_command: &EditorInstallCommand) -> String {
    format!(
        "{} ({})",
        editor_command.display_name,
        editor_command.executable_path.to_string_lossy()
    )
}

fn sanitize_file_name(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect()
}

fn quote_powershell_string(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn executable_file_names_prefers_windows_launchers_before_extensionless_names() {
        let candidate_file_names = executable_file_names("cursor");

        assert!(candidate_file_names.contains(&"cursor.cmd".to_string()));
        assert_eq!(
            candidate_file_names.last().map(String::as_str),
            Some("cursor")
        );
    }

    #[test]
    fn sanitize_file_name_replaces_path_unsafe_characters() {
        let safe_file_name = sanitize_file_name("tauri-apps/tauri:vscode");

        assert_eq!(safe_file_name, "tauri-apps-tauri-vscode");
    }

    #[test]
    fn validate_open_vsx_download_url_rejects_lookalike_hosts() {
        assert!(validate_open_vsx_download_url("https://open-vsx.org/api/item.vsix").is_ok());
        assert!(
            validate_open_vsx_download_url("https://open-vsx.org.evil.test/api/item.vsix").is_err()
        );
        assert!(validate_open_vsx_download_url("http://open-vsx.org/api/item.vsix").is_err());
    }

    #[test]
    fn unquote_shell_path_removes_matching_outer_quotes() {
        assert_eq!(
            unquote_shell_path("\"C:\\Projects\\Codemind\""),
            "C:\\Projects\\Codemind"
        );
        assert_eq!(unquote_shell_path("'folder name'"), "folder name");
        assert_eq!(unquote_shell_path("\"missing"), "\"missing");
    }
}
