use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
};

pub const CODEX_CLI_INSTALL_COMMAND: &str = "npm i -g @openai/codex";
const UNKNOWN_LOGIN_STATUS_TEXT: &str = "Codex login status could not be checked.";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone)]
pub struct ResolvedCodexExecutable {
    executable_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct CodexLoginStatus {
    pub is_authenticated: bool,
    pub status_text: String,
}

impl ResolvedCodexExecutable {
    pub fn executable_path(&self) -> &Path {
        &self.executable_path
    }

    pub fn create_command(&self) -> Command {
        create_command_for_executable(&self.executable_path)
    }
}

pub fn read_codex_login_status(codex_executable: &ResolvedCodexExecutable) -> CodexLoginStatus {
    let mut status_command = codex_executable.create_command();
    status_command.args(["login", "status"]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        status_command.creation_flags(CREATE_NO_WINDOW);
    }

    let Ok(output) = status_command.output() else {
        return CodexLoginStatus {
            is_authenticated: false,
            status_text: UNKNOWN_LOGIN_STATUS_TEXT.to_string(),
        };
    };

    let status_text = [
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ]
    .into_iter()
    .filter(|text| !text.is_empty())
    .collect::<Vec<_>>()
    .join("\n");
    let status_text = if status_text.is_empty() {
        UNKNOWN_LOGIN_STATUS_TEXT.to_string()
    } else {
        status_text
    };
    let normalized_status_text = status_text.to_lowercase();

    CodexLoginStatus {
        is_authenticated: output.status.success()
            && normalized_status_text.starts_with("logged in"),
        status_text,
    }
}

pub fn resolve_codex_executable() -> Result<ResolvedCodexExecutable, String> {
    find_codex_executable()
        .map(|executable_path| ResolvedCodexExecutable { executable_path })
        .ok_or_else(|| {
            format!(
                "Codex CLI was not found. Install it with `{CODEX_CLI_INSTALL_COMMAND}` or add its bin folder to PATH."
            )
        })
}

fn find_codex_executable() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        find_windows_native_command_on_path("codex")
            .or_else(find_openai_codex_install)
            .or_else(|| find_windows_script_command_on_path("codex"))
            .or_else(|| find_windows_extensionless_native_command_on_path("codex"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        find_executable_on_path("codex")
    }
}

#[cfg(not(target_os = "windows"))]
fn find_executable_on_path(executable_name: &str) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;
    env::split_paths(&path_value)
        .map(|path_directory| path_directory.join(executable_name))
        .find(|candidate_path| candidate_path.is_file())
}

#[cfg(target_os = "windows")]
fn find_openai_codex_install() -> Option<PathBuf> {
    let local_app_data = env::var_os("LOCALAPPDATA")?;
    let codex_path = Path::new(&local_app_data)
        .join("OpenAI")
        .join("Codex")
        .join("bin")
        .join("codex.exe");

    codex_path.is_file().then_some(codex_path)
}

fn create_command_for_executable(executable_path: &Path) -> Command {
    if is_windows_batch_file(executable_path) {
        let mut command = Command::new("cmd");
        command.arg("/D").arg("/C").arg(executable_path);
        return command;
    }

    Command::new(executable_path)
}

#[cfg(target_os = "windows")]
fn find_windows_native_command_on_path(command_name: &str) -> Option<PathBuf> {
    find_windows_command_on_path(command_name, &["exe", "com"])
}

#[cfg(target_os = "windows")]
fn find_windows_script_command_on_path(command_name: &str) -> Option<PathBuf> {
    find_windows_command_on_path(command_name, &["cmd", "bat"])
}

#[cfg(target_os = "windows")]
fn find_windows_command_on_path(command_name: &str, extensions: &[&str]) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;

    for path_directory in env::split_paths(&path_value) {
        for extension in extensions {
            let candidate_path = path_directory.join(format!("{command_name}.{extension}"));
            if candidate_path.is_file() {
                return Some(candidate_path);
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn find_windows_extensionless_native_command_on_path(command_name: &str) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;
    env::split_paths(&path_value)
        .map(|path_directory| path_directory.join(command_name))
        .find(|candidate_path| candidate_path.is_file() && is_windows_native_binary(candidate_path))
}

#[cfg(target_os = "windows")]
fn is_windows_native_binary(candidate_path: &Path) -> bool {
    let Ok(file_header) = std::fs::read(candidate_path) else {
        return false;
    };

    file_header.starts_with(b"MZ")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_command_uses_openai_codex_npm_package() {
        assert_eq!(CODEX_CLI_INSTALL_COMMAND, "npm i -g @openai/codex");
    }

    #[test]
    fn unknown_login_status_is_not_authenticated() {
        assert!(!UNKNOWN_LOGIN_STATUS_TEXT
            .to_lowercase()
            .contains("logged in"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_batch_files_are_wrapped_with_command_prompt() {
        assert!(is_windows_batch_file(Path::new("codex.cmd")));
        assert!(is_windows_batch_file(Path::new("codex.bat")));
        assert!(!is_windows_batch_file(Path::new("codex.exe")));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_native_binary_check_rejects_shell_script_shims() {
        let temp_directory = env::temp_dir();
        let script_path = temp_directory.join(format!(
            "codemind-codex-shell-shim-{}.tmp",
            std::process::id()
        ));
        let executable_path = temp_directory.join(format!(
            "codemind-codex-native-shim-{}.tmp",
            std::process::id()
        ));

        std::fs::write(&script_path, b"#!/bin/sh\nexec node codex \"$@\"\n").unwrap();
        std::fs::write(&executable_path, b"MZ").unwrap();

        assert!(!is_windows_native_binary(&script_path));
        assert!(is_windows_native_binary(&executable_path));

        let _ = std::fs::remove_file(script_path);
        let _ = std::fs::remove_file(executable_path);
    }
}
