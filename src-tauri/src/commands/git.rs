use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const DEFAULT_REMOTE_NAME: &str = "origin";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepositoryStatus {
    pub is_repository: bool,
    pub root: Option<String>,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub remote_url: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub has_conflicts: bool,
    pub has_commits: bool,
    pub last_commit: Option<String>,
    pub changed_files: Vec<GitChangedFile>,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub working_tree_status: String,
    pub change_type: String,
    pub is_staged: bool,
    pub is_unstaged: bool,
    pub is_untracked: bool,
    pub has_conflict: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOperationResult {
    pub success: bool,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone)]
struct GitCommandOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Clone, Default)]
struct StatusHeader {
    branch: Option<String>,
    upstream: Option<String>,
    ahead: usize,
    behind: usize,
}

#[tauri::command]
pub fn read_git_repository_status(project_root: String) -> Result<GitRepositoryStatus, String> {
    let working_directory = resolve_existing_project_root(&project_root)?;
    let repository_root_output =
        run_git_command(&working_directory, &["rev-parse", "--show-toplevel"])?;

    if !repository_root_output.success {
        return Ok(create_empty_status());
    }

    let repository_root = PathBuf::from(repository_root_output.stdout.trim());
    let status_output = run_git_command(
        &repository_root,
        &[
            "-c",
            "core.quotePath=false",
            "status",
            "--porcelain=v1",
            "-b",
            "-uall",
        ],
    )?;
    if !status_output.success {
        return Err(format_git_failure("Git status failed", &status_output));
    }

    let mut status_header = StatusHeader::default();
    let mut changed_files = Vec::new();

    for status_line in status_output.stdout.lines() {
        if status_line.starts_with("## ") {
            status_header = parse_status_header(status_line);
            continue;
        }

        if let Some(changed_file) = parse_changed_file(status_line) {
            changed_files.push(changed_file);
        }
    }

    let upstream = status_header.upstream.clone().or_else(|| {
        read_single_line_git_output(
            &repository_root,
            &[
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ],
        )
    });
    let (behind, ahead) = read_ahead_behind_counts(&repository_root, upstream.as_deref())
        .unwrap_or((status_header.behind, status_header.ahead));
    let remote_url = read_remote_url(&repository_root, upstream.as_deref());
    let has_commits = repository_has_commits(&repository_root);
    let last_commit = if has_commits {
        read_single_line_git_output(&repository_root, &["log", "-1", "--pretty=format:%h %s"])
    } else {
        None
    };
    let staged_count = changed_files
        .iter()
        .filter(|changed_file| changed_file.is_staged)
        .count();
    let unstaged_count = changed_files
        .iter()
        .filter(|changed_file| changed_file.is_unstaged)
        .count();
    let untracked_count = changed_files
        .iter()
        .filter(|changed_file| changed_file.is_untracked)
        .count();
    let has_conflicts = changed_files
        .iter()
        .any(|changed_file| changed_file.has_conflict);

    Ok(GitRepositoryStatus {
        is_repository: true,
        root: Some(repository_root.to_string_lossy().to_string()),
        branch: status_header.branch,
        upstream,
        remote_url,
        ahead,
        behind,
        has_conflicts,
        has_commits,
        last_commit,
        changed_files,
        staged_count,
        unstaged_count,
        untracked_count,
    })
}

#[tauri::command]
pub fn git_init_repository(project_root: String) -> Result<GitOperationResult, String> {
    let working_directory = resolve_existing_project_root(&project_root)?;
    let output = run_git_command(&working_directory, &["init"])?;
    Ok(create_operation_result(
        "Initialized Git repository.",
        output,
    ))
}

#[tauri::command]
pub fn git_set_remote(
    project_root: String,
    remote_url: String,
) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    let trimmed_remote_url = remote_url.trim();
    if trimmed_remote_url.is_empty() {
        return Err("remote URL cannot be empty".to_string());
    }

    let existing_remote = run_git_command(
        &repository_root,
        &["remote", "get-url", DEFAULT_REMOTE_NAME],
    )?;
    let output = if existing_remote.success {
        run_git_command(
            &repository_root,
            &["remote", "set-url", DEFAULT_REMOTE_NAME, trimmed_remote_url],
        )?
    } else {
        run_git_command(
            &repository_root,
            &["remote", "add", DEFAULT_REMOTE_NAME, trimmed_remote_url],
        )?
    };

    Ok(create_operation_result("Updated origin remote.", output))
}

#[tauri::command]
pub fn git_stage_paths(
    project_root: String,
    paths: Vec<String>,
) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    if paths.is_empty() {
        return Ok(create_no_selection_result());
    }

    let output = run_git_path_command(&repository_root, &["add"], &paths)?;
    Ok(create_operation_result("Staged selected files.", output))
}

#[tauri::command]
pub fn git_unstage_paths(
    project_root: String,
    paths: Vec<String>,
) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    if paths.is_empty() {
        return Ok(create_no_selection_result());
    }

    let output = run_git_path_command(&repository_root, &["restore", "--staged"], &paths)?;
    Ok(create_operation_result("Unstaged selected files.", output))
}

#[tauri::command]
pub fn git_discard_paths(
    project_root: String,
    paths: Vec<String>,
) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    if paths.is_empty() {
        return Ok(create_no_selection_result());
    }

    let selected_paths: HashSet<&str> = paths.iter().map(String::as_str).collect();
    let repository_status = read_git_repository_status(project_root)?;
    let untracked_paths: Vec<String> = repository_status
        .changed_files
        .iter()
        .filter(|changed_file| {
            changed_file.is_untracked && selected_paths.contains(changed_file.path.as_str())
        })
        .map(|changed_file| changed_file.path.clone())
        .collect();
    let tracked_paths: Vec<String> = paths
        .iter()
        .filter(|path| {
            !untracked_paths
                .iter()
                .any(|untracked_path| untracked_path == *path)
        })
        .cloned()
        .collect();

    let mut operation_outputs = Vec::new();
    if !tracked_paths.is_empty() {
        operation_outputs.push(run_git_path_command(
            &repository_root,
            &["restore", "--source=HEAD", "--staged", "--worktree"],
            &tracked_paths,
        )?);
    }
    if !untracked_paths.is_empty() {
        operation_outputs.push(run_git_path_command(
            &repository_root,
            &["clean", "-f"],
            &untracked_paths,
        )?);
    }

    Ok(merge_operation_results(
        "Discarded selected changes.",
        "Git discard failed.",
        operation_outputs,
    ))
}

#[tauri::command]
pub fn git_commit(project_root: String, message: String) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    let trimmed_message = message.trim();
    if trimmed_message.is_empty() {
        return Err("commit message cannot be empty".to_string());
    }

    let output = run_git_command(&repository_root, &["commit", "-m", trimmed_message])?;
    Ok(create_operation_result("Committed staged changes.", output))
}

#[tauri::command]
pub fn git_pull(project_root: String) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    let output = run_git_command(&repository_root, &["pull", "--ff-only"])?;
    Ok(create_operation_result("Pulled latest changes.", output))
}

#[tauri::command]
pub fn git_push(project_root: String) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    push_current_branch(&repository_root)
}

#[tauri::command]
pub fn git_sync(project_root: String) -> Result<GitOperationResult, String> {
    let repository_root = resolve_repository_root(&project_root)?;
    let repository_status = read_git_repository_status(project_root)?;
    let mut operation_outputs = Vec::new();

    if repository_status.upstream.is_some() {
        let pull_output = run_git_command(&repository_root, &["pull", "--ff-only"])?;
        let pull_succeeded = pull_output.success;
        operation_outputs.push(pull_output);
        if !pull_succeeded {
            return Ok(merge_operation_results(
                "Synced repository.",
                "Git pull failed before push.",
                operation_outputs,
            ));
        }
    }

    let push_result = push_current_branch(&repository_root)?;
    operation_outputs.push(GitCommandOutput {
        success: push_result.success,
        stdout: push_result.stdout,
        stderr: push_result.stderr,
    });

    Ok(merge_operation_results(
        "Synced repository.",
        "Git sync failed.",
        operation_outputs,
    ))
}

fn push_current_branch(repository_root: &Path) -> Result<GitOperationResult, String> {
    let repository_status =
        read_git_repository_status(repository_root.to_string_lossy().to_string())?;
    if !repository_status.has_commits {
        return Ok(GitOperationResult {
            success: false,
            message: "Create an initial commit before pushing. Stage files, write a commit message, commit, then push or sync.".to_string(),
            stdout: String::new(),
            stderr: String::new(),
        });
    }

    let output = if repository_status.upstream.is_some() {
        run_git_command(repository_root, &["push"])?
    } else {
        let current_branch = repository_status
            .branch
            .ok_or_else(|| "current Git branch could not be determined".to_string())?;
        if read_named_remote_url(repository_root, DEFAULT_REMOTE_NAME).is_none() {
            return Err("set an origin remote before publishing this branch".to_string());
        }
        run_git_command(
            repository_root,
            &["push", "-u", DEFAULT_REMOTE_NAME, current_branch.as_str()],
        )?
    };

    Ok(create_operation_result("Pushed current branch.", output))
}

fn resolve_existing_project_root(project_root: &str) -> Result<PathBuf, String> {
    let trimmed_project_root = project_root.trim();
    if trimmed_project_root.is_empty() {
        return Err("project root cannot be empty".to_string());
    }

    let working_directory = fs::canonicalize(trimmed_project_root)
        .map_err(|error| format!("project root could not be opened: {error}"))?;
    if !working_directory.is_dir() {
        return Err("project root must be a directory".to_string());
    }

    Ok(working_directory)
}

fn resolve_repository_root(project_root: &str) -> Result<PathBuf, String> {
    let working_directory = resolve_existing_project_root(project_root)?;
    let repository_root_output =
        run_git_command(&working_directory, &["rev-parse", "--show-toplevel"])?;
    if !repository_root_output.success {
        return Err(format_git_failure(
            "This project is not a Git repository",
            &repository_root_output,
        ));
    }

    Ok(PathBuf::from(repository_root_output.stdout.trim()))
}

fn run_git_path_command(
    repository_root: &Path,
    base_args: &[&str],
    paths: &[String],
) -> Result<GitCommandOutput, String> {
    let mut args: Vec<String> = base_args
        .iter()
        .map(|argument| argument.to_string())
        .collect();
    args.push("--".to_string());
    args.extend(paths.iter().cloned());
    run_git_command_with_strings(repository_root, &args)
}

fn run_git_command(repository_root: &Path, args: &[&str]) -> Result<GitCommandOutput, String> {
    let owned_args: Vec<String> = args.iter().map(|argument| argument.to_string()).collect();
    run_git_command_with_strings(repository_root, &owned_args)
}

fn run_git_command_with_strings(
    repository_root: &Path,
    args: &[String],
) -> Result<GitCommandOutput, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(repository_root);
    for argument in args {
        command.arg(argument);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|error| format!("failed to start git: {error}"))?;

    Ok(GitCommandOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn read_single_line_git_output(repository_root: &Path, args: &[&str]) -> Option<String> {
    let output = run_git_command(repository_root, args).ok()?;
    if !output.success {
        return None;
    }

    let trimmed_output = output.stdout.trim();
    if trimmed_output.is_empty() {
        None
    } else {
        Some(trimmed_output.to_string())
    }
}

fn read_remote_url(repository_root: &Path, upstream: Option<&str>) -> Option<String> {
    let mut remote_names = Vec::new();
    if let Some(upstream_branch) = upstream {
        if let Some((remote_name, _)) = upstream_branch.split_once('/') {
            remote_names.push(remote_name.to_string());
        }
    }
    remote_names.push(DEFAULT_REMOTE_NAME.to_string());

    let mut seen_remote_names = HashSet::new();
    for remote_name in remote_names {
        if !seen_remote_names.insert(remote_name.clone()) {
            continue;
        }
        if let Some(remote_url) = read_named_remote_url(repository_root, &remote_name) {
            return Some(remote_url);
        }
    }

    None
}

fn read_named_remote_url(repository_root: &Path, remote_name: &str) -> Option<String> {
    read_single_line_git_output(
        repository_root,
        &["config", "--get", &format!("remote.{remote_name}.url")],
    )
}

fn read_ahead_behind_counts(
    repository_root: &Path,
    upstream: Option<&str>,
) -> Option<(usize, usize)> {
    let upstream = upstream?;
    let revision_range = format!("{upstream}...HEAD");
    let output = read_single_line_git_output(
        repository_root,
        &[
            "rev-list",
            "--left-right",
            "--count",
            revision_range.as_str(),
        ],
    )?;
    let mut counts = output.split_whitespace();
    let behind = counts.next()?.parse::<usize>().ok()?;
    let ahead = counts.next()?.parse::<usize>().ok()?;
    Some((behind, ahead))
}

fn repository_has_commits(repository_root: &Path) -> bool {
    run_git_command(repository_root, &["rev-parse", "--verify", "HEAD"])
        .map(|output| output.success)
        .unwrap_or(false)
}

fn create_empty_status() -> GitRepositoryStatus {
    GitRepositoryStatus {
        is_repository: false,
        root: None,
        branch: None,
        upstream: None,
        remote_url: None,
        ahead: 0,
        behind: 0,
        has_conflicts: false,
        has_commits: false,
        last_commit: None,
        changed_files: Vec::new(),
        staged_count: 0,
        unstaged_count: 0,
        untracked_count: 0,
    }
}

fn parse_status_header(status_line: &str) -> StatusHeader {
    let header_body = status_line.trim_start_matches("## ").trim();
    let (branch_text, tracking_text) = split_tracking_suffix(header_body);
    let mut status_header = parse_tracking_counts(tracking_text);

    if let Some(branch_name) = branch_text.strip_prefix("No commits yet on ") {
        status_header.branch = Some(branch_name.trim().to_string());
        return status_header;
    }

    if let Some((branch_name, upstream_name)) = branch_text.split_once("...") {
        status_header.branch = Some(branch_name.trim().to_string());
        status_header.upstream = Some(upstream_name.trim().to_string());
        return status_header;
    }

    if !branch_text.is_empty() {
        status_header.branch = Some(branch_text.to_string());
    }

    status_header
}

fn split_tracking_suffix(header_body: &str) -> (&str, Option<&str>) {
    if let Some(tracking_start_index) = header_body.rfind(" [") {
        if header_body.ends_with(']') {
            return (
                header_body[..tracking_start_index].trim(),
                Some(&header_body[tracking_start_index + 2..header_body.len() - 1]),
            );
        }
    }

    (header_body, None)
}

fn parse_tracking_counts(tracking_text: Option<&str>) -> StatusHeader {
    let mut status_header = StatusHeader::default();
    let Some(tracking_text) = tracking_text else {
        return status_header;
    };

    for tracking_part in tracking_text.split(',') {
        let trimmed_tracking_part = tracking_part.trim();
        if let Some(ahead_count) = trimmed_tracking_part.strip_prefix("ahead ") {
            status_header.ahead = ahead_count.parse::<usize>().unwrap_or(0);
        }
        if let Some(behind_count) = trimmed_tracking_part.strip_prefix("behind ") {
            status_header.behind = behind_count.parse::<usize>().unwrap_or(0);
        }
    }

    status_header
}

fn parse_changed_file(status_line: &str) -> Option<GitChangedFile> {
    if status_line.len() < 4 {
        return None;
    }

    let mut status_characters = status_line.chars();
    let index_status = status_characters.next()?;
    let working_tree_status = status_characters.next()?;
    let path_text = status_line.get(3..)?.trim();
    let (path, original_path) = parse_status_path(index_status, path_text);
    let is_untracked = index_status == '?' && working_tree_status == '?';
    let has_conflict = is_conflict_status(index_status, working_tree_status);
    let is_staged = !is_untracked && index_status != ' ' && index_status != '?';
    let is_unstaged =
        is_untracked || has_conflict || (working_tree_status != ' ' && working_tree_status != '?');

    Some(GitChangedFile {
        path,
        original_path,
        index_status: index_status.to_string(),
        working_tree_status: working_tree_status.to_string(),
        change_type: get_change_type(index_status, working_tree_status),
        is_staged,
        is_unstaged,
        is_untracked,
        has_conflict,
    })
}

fn parse_status_path(index_status: char, path_text: &str) -> (String, Option<String>) {
    if matches!(index_status, 'R' | 'C') {
        if let Some((original_path, next_path)) = path_text.split_once(" -> ") {
            return (next_path.to_string(), Some(original_path.to_string()));
        }
    }

    (path_text.to_string(), None)
}

fn is_conflict_status(index_status: char, working_tree_status: char) -> bool {
    matches!(
        (index_status, working_tree_status),
        ('D', 'D') | ('A', 'U') | ('U', 'D') | ('U', 'A') | ('D', 'U') | ('A', 'A') | ('U', 'U')
    )
}

fn get_change_type(index_status: char, working_tree_status: char) -> String {
    if index_status == '?' && working_tree_status == '?' {
        return "Untracked".to_string();
    }
    if is_conflict_status(index_status, working_tree_status) {
        return "Conflict".to_string();
    }

    match index_status {
        'A' => "Added",
        'D' => "Deleted",
        'R' => "Renamed",
        'C' => "Copied",
        'M' => "Modified",
        _ => match working_tree_status {
            'D' => "Deleted",
            'M' => "Modified",
            _ => "Changed",
        },
    }
    .to_string()
}

fn create_operation_result(
    success_message: &str,
    git_command_output: GitCommandOutput,
) -> GitOperationResult {
    let message = if git_command_output.success {
        success_message.to_string()
    } else {
        format_git_failure("Git command failed", &git_command_output)
    };

    GitOperationResult {
        success: git_command_output.success,
        message,
        stdout: git_command_output.stdout,
        stderr: git_command_output.stderr,
    }
}

fn merge_operation_results(
    success_message: &str,
    failure_message: &str,
    git_command_outputs: Vec<GitCommandOutput>,
) -> GitOperationResult {
    let success = git_command_outputs.iter().all(|output| output.success);
    let stdout = git_command_outputs
        .iter()
        .map(|output| output.stdout.as_str())
        .filter(|stdout| !stdout.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let stderr = git_command_outputs
        .iter()
        .map(|output| output.stderr.as_str())
        .filter(|stderr| !stderr.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    GitOperationResult {
        success,
        message: if success {
            success_message.to_string()
        } else if stderr.trim().is_empty() {
            failure_message.to_string()
        } else {
            stderr.trim().to_string()
        },
        stdout,
        stderr,
    }
}

fn create_no_selection_result() -> GitOperationResult {
    GitOperationResult {
        success: false,
        message: "No files selected.".to_string(),
        stdout: String::new(),
        stderr: String::new(),
    }
}

fn format_git_failure(prefix: &str, git_command_output: &GitCommandOutput) -> String {
    let git_message = if git_command_output.stderr.trim().is_empty() {
        git_command_output.stdout.trim()
    } else {
        git_command_output.stderr.trim()
    };

    if git_message.is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}: {git_message}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_status_header_reads_branch_upstream_and_counts() {
        let status_header = parse_status_header("## main...origin/main [ahead 2, behind 1]");

        assert_eq!(status_header.branch.as_deref(), Some("main"));
        assert_eq!(status_header.upstream.as_deref(), Some("origin/main"));
        assert_eq!(status_header.ahead, 2);
        assert_eq!(status_header.behind, 1);
    }

    #[test]
    fn parse_changed_file_reads_renames() {
        let changed_file = parse_changed_file("R  old-name.ts -> new-name.ts").unwrap();

        assert_eq!(changed_file.path, "new-name.ts");
        assert_eq!(changed_file.original_path.as_deref(), Some("old-name.ts"));
        assert_eq!(changed_file.change_type, "Renamed");
        assert!(changed_file.is_staged);
    }

    #[test]
    fn parse_changed_file_marks_untracked_files() {
        let changed_file = parse_changed_file("?? src/new-file.ts").unwrap();

        assert_eq!(changed_file.path, "src/new-file.ts");
        assert_eq!(changed_file.change_type, "Untracked");
        assert!(changed_file.is_untracked);
        assert!(changed_file.is_unstaged);
    }
}
