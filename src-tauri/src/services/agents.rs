use crate::{database::Database, models::AgentTokenEvent, services::cli};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Read},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const STREAM_EVENT_NAME: &str = "agent-token";
const STOPPED_RESPONSE_TEXT: &str = "Stopped by user.";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct AgentStreamContext {
    app_handle: AppHandle,
    session_id: String,
    message_id: String,
}

struct ActiveAgentRun {
    message_id: String,
    is_cancelled: Arc<AtomicBool>,
    process_id: Option<u32>,
}

struct AgentActivityDescription {
    activity_id: Option<String>,
    message: String,
    kind: &'static str,
    detail: Option<String>,
    output: Option<String>,
}

#[derive(Clone)]
struct AgentCancellationToken {
    session_id: String,
    message_id: String,
    is_cancelled: Arc<AtomicBool>,
}

impl AgentCancellationToken {
    fn is_cancelled(&self) -> bool {
        self.is_cancelled.load(Ordering::SeqCst)
    }
}

static ACTIVE_AGENT_RUNS: OnceLock<Mutex<HashMap<String, ActiveAgentRun>>> = OnceLock::new();

#[allow(clippy::too_many_arguments)]
pub fn stream_agent_response(
    app_handle: AppHandle,
    session_id: String,
    message_id: String,
    prompt: String,
    project_root: Option<String>,
    agent_id: String,
    model: Option<String>,
    reasoning_effort: Option<String>,
    rule_context: Option<String>,
    work_mode: Option<String>,
    approval_mode: Option<String>,
) {
    std::thread::spawn(move || {
        let stream_context = AgentStreamContext {
            app_handle,
            session_id,
            message_id,
        };
        let cancellation_token =
            register_active_agent_run(&stream_context.session_id, &stream_context.message_id);

        emit_agent_activity(&stream_context, "Preparing request", "thinking");

        let response = if agent_id == "codex-cli" {
            emit_agent_activity(
                &stream_context,
                "Applying selected model and rules",
                "thinking",
            );
            create_codex_cli_response(
                &stream_context,
                &prompt,
                project_root,
                model,
                reasoning_effort,
                rule_context.as_deref(),
                work_mode.as_deref(),
                approval_mode.as_deref(),
                &cancellation_token,
            )
            .unwrap_or_else(|error| {
                if cancellation_token.is_cancelled() {
                    return STOPPED_RESPONSE_TEXT.to_string();
                }

                format!(
                    "Codex CLI could not complete this request.\n\nError: {error}\n\nYou can still use the built-in shell and editor while checking your Codex login/configuration."
                )
            })
        } else {
            emit_agent_activity(
                &stream_context,
                "Using the configured provider adapter",
                "thinking",
            );
            create_local_agent_response(&prompt, rule_context.as_deref(), work_mode.as_deref())
        };
        let was_cancelled = cancellation_token.is_cancelled();

        if let Ok(database) = Database::open() {
            let _ = database
                .update_message_content(stream_context.message_id.clone(), response.clone());
        }

        emit_agent_activity(
            &stream_context,
            if was_cancelled {
                "Response stopped"
            } else {
                "Response saved"
            },
            "status",
        );
        emit_agent_complete(stream_context);
        unregister_active_agent_run(&cancellation_token);
    });
}

pub fn stop_agent_response(session_id: &str) -> Result<(), String> {
    let process_id = {
        let mut active_runs = active_agent_runs()
            .lock()
            .map_err(|_| "active agent run lock failed".to_string())?;

        let Some(active_run) = active_runs.get_mut(session_id) else {
            return Ok(());
        };

        active_run.is_cancelled.store(true, Ordering::SeqCst);
        active_run.process_id
    };

    if let Some(process_id) = process_id {
        let _ = kill_process_tree(process_id);
    }

    Ok(())
}

fn active_agent_runs() -> &'static Mutex<HashMap<String, ActiveAgentRun>> {
    ACTIVE_AGENT_RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_active_agent_run(session_id: &str, message_id: &str) -> AgentCancellationToken {
    let is_cancelled = Arc::new(AtomicBool::new(false));
    let previous_process_id = active_agent_runs()
        .lock()
        .ok()
        .and_then(|mut active_runs| {
            active_runs
                .insert(
                    session_id.to_string(),
                    ActiveAgentRun {
                        message_id: message_id.to_string(),
                        is_cancelled: Arc::clone(&is_cancelled),
                        process_id: None,
                    },
                )
                .map(|previous_run| {
                    previous_run.is_cancelled.store(true, Ordering::SeqCst);
                    previous_run.process_id
                })
        })
        .flatten();

    if let Some(process_id) = previous_process_id {
        let _ = kill_process_tree(process_id);
    }

    AgentCancellationToken {
        session_id: session_id.to_string(),
        message_id: message_id.to_string(),
        is_cancelled,
    }
}

fn set_active_agent_process_id(
    cancellation_token: &AgentCancellationToken,
    process_id: u32,
) -> Result<(), String> {
    let mut active_runs = active_agent_runs()
        .lock()
        .map_err(|_| "active agent run lock failed".to_string())?;

    if let Some(active_run) = active_runs.get_mut(&cancellation_token.session_id) {
        if active_run.message_id == cancellation_token.message_id {
            active_run.process_id = Some(process_id);
        }
    }

    Ok(())
}

fn unregister_active_agent_run(cancellation_token: &AgentCancellationToken) {
    if let Ok(mut active_runs) = active_agent_runs().lock() {
        let should_remove = active_runs
            .get(&cancellation_token.session_id)
            .is_some_and(|active_run| active_run.message_id == cancellation_token.message_id);

        if should_remove {
            active_runs.remove(&cancellation_token.session_id);
        }
    }
}

#[cfg(target_os = "windows")]
fn kill_process_tree(process_id: u32) -> Result<(), String> {
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
        .ok_or_else(|| format!("failed to stop process tree for pid {process_id}"))
}

#[cfg(not(target_os = "windows"))]
fn kill_process_tree(process_id: u32) -> Result<(), String> {
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

fn emit_agent_activity(
    stream_context: &AgentStreamContext,
    activity_message: &str,
    activity_kind: &str,
) {
    emit_agent_activity_with_details(
        stream_context,
        None,
        activity_message,
        activity_kind,
        None,
        None,
    );
}

fn emit_agent_activity_with_details(
    stream_context: &AgentStreamContext,
    activity_id: Option<String>,
    activity_message: &str,
    activity_kind: &str,
    activity_detail: Option<String>,
    activity_output: Option<String>,
) {
    let _ = stream_context.app_handle.emit(
        STREAM_EVENT_NAME,
        AgentTokenEvent {
            session_id: stream_context.session_id.clone(),
            message_id: stream_context.message_id.clone(),
            token: String::new(),
            is_complete: false,
            activity_id,
            activity_message: Some(activity_message.to_string()),
            activity_kind: Some(activity_kind.to_string()),
            activity_detail,
            activity_output,
        },
    );
}

fn emit_agent_token(stream_context: &AgentStreamContext, token: String) {
    let _ = stream_context.app_handle.emit(
        STREAM_EVENT_NAME,
        AgentTokenEvent {
            session_id: stream_context.session_id.clone(),
            message_id: stream_context.message_id.clone(),
            token,
            is_complete: false,
            activity_id: None,
            activity_message: None,
            activity_kind: None,
            activity_detail: None,
            activity_output: None,
        },
    );
}

fn emit_agent_complete(stream_context: AgentStreamContext) {
    let _ = stream_context.app_handle.emit(
        STREAM_EVENT_NAME,
        AgentTokenEvent {
            session_id: stream_context.session_id,
            message_id: stream_context.message_id,
            token: String::new(),
            is_complete: true,
            activity_id: None,
            activity_message: Some("Agent response complete".to_string()),
            activity_kind: Some("status".to_string()),
            activity_detail: None,
            activity_output: None,
        },
    );
}

#[allow(clippy::too_many_arguments)]
fn create_codex_cli_response(
    stream_context: &AgentStreamContext,
    prompt: &str,
    project_root: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    rule_context: Option<&str>,
    work_mode: Option<&str>,
    approval_mode: Option<&str>,
    cancellation_token: &AgentCancellationToken,
) -> Result<String, String> {
    let working_directory = project_root
        .filter(|root| !root.trim().is_empty())
        .unwrap_or_else(|| {
            std::env::current_dir()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default()
        });
    let prompt_with_rules =
        create_prompt_with_request_context(prompt, rule_context, work_mode, approval_mode);
    let final_message_path =
        std::env::temp_dir().join(format!("codemind-codex-response-{}.txt", Uuid::new_v4()));
    let final_message_path_text = final_message_path.to_string_lossy().to_string();

    let mut arguments = Vec::new();
    append_permission_arguments(&mut arguments, approval_mode);
    arguments.extend(vec![
        "exec".to_string(),
        "--cd".to_string(),
        working_directory,
        "--skip-git-repo-check".to_string(),
        "--color".to_string(),
        "never".to_string(),
        "--json".to_string(),
        "--output-last-message".to_string(),
        final_message_path_text.clone(),
    ]);

    if let Some(selected_model) = model.filter(|value| !value.trim().is_empty()) {
        arguments.push("--model".to_string());
        arguments.push(selected_model);
    }

    if let Some(selected_reasoning_effort) =
        reasoning_effort.filter(|value| !value.trim().is_empty())
    {
        arguments.push("--config".to_string());
        arguments.push(format!(
            "model_reasoning_effort=\"{}\"",
            selected_reasoning_effort.to_lowercase()
        ));
    }

    arguments.push(prompt_with_rules);

    let codex_executable = cli::resolve_codex_executable()?;
    let mut codex_command = codex_executable.create_command();
    codex_command
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_long_running_child_process(&mut codex_command);

    emit_agent_activity(stream_context, "Launching Codex CLI", "status");
    let mut child = codex_command.spawn().map_err(|error| error.to_string())?;
    let child_process_id = child.id();
    set_active_agent_process_id(cancellation_token, child_process_id)?;
    if cancellation_token.is_cancelled() {
        let _ = kill_process_tree(child_process_id);
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex CLI stdout stream was unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Codex CLI stderr stream was unavailable".to_string())?;
    let stderr_reader = std::thread::spawn(move || {
        let mut stderr_text = String::new();
        let mut reader = BufReader::new(stderr);
        let _ = reader.read_to_string(&mut stderr_text);
        stderr_text
    });

    let mut streamed_response = String::new();
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();

    loop {
        if cancellation_token.is_cancelled() {
            break;
        }

        line.clear();
        let bytes_read = reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;
        if bytes_read == 0 {
            break;
        }

        if !cancellation_token.is_cancelled() {
            handle_codex_json_event(stream_context, line.trim(), &mut streamed_response);
        }
    }

    let exit_status = child.wait().map_err(|error| error.to_string())?;
    let stderr = stderr_reader
        .join()
        .unwrap_or_else(|_| "failed to read Codex CLI stderr".to_string())
        .trim()
        .to_string();
    let final_response = fs::read_to_string(&final_message_path)
        .unwrap_or_else(|_| streamed_response.clone())
        .trim()
        .to_string();
    let _ = fs::remove_file(final_message_path);

    if cancellation_token.is_cancelled() {
        return Ok(STOPPED_RESPONSE_TEXT.to_string());
    }

    if !exit_status.success() {
        return Err(if stderr.is_empty() {
            final_response
        } else {
            stderr
        });
    }

    if final_response.is_empty() {
        Ok("Codex CLI completed without text output.".to_string())
    } else {
        if streamed_response.trim().is_empty() {
            stream_text_response(stream_context, &final_response);
        }
        Ok(final_response)
    }
}

fn configure_long_running_child_process(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    #[cfg(all(unix, not(target_os = "windows")))]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            command.pre_exec(|| {
                if libc::setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(std::io::Error::last_os_error())
                }
            });
        }
    }
}

fn handle_codex_json_event(
    stream_context: &AgentStreamContext,
    json_line: &str,
    streamed_response: &mut String,
) {
    let Ok(event) = serde_json::from_str::<Value>(json_line) else {
        return;
    };

    let event_type = event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("codex.event");

    if let Some(token) = extract_response_token(&event) {
        streamed_response.push_str(&token);
        emit_agent_token(stream_context, token);
        return;
    }

    if let Some(activity_description) = describe_codex_activity(event_type, &event) {
        emit_agent_activity_with_details(
            stream_context,
            activity_description.activity_id,
            &activity_description.message,
            activity_description.kind,
            activity_description.detail,
            activity_description.output,
        );
    }
}

fn extract_response_token(event: &Value) -> Option<String> {
    if event.get("type").and_then(Value::as_str) == Some("item.completed")
        && event.pointer("/item/type").and_then(Value::as_str) == Some("agent_message")
    {
        return event
            .pointer("/item/text")
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    for key in ["delta", "text", "content", "message"] {
        if let Some(value) = event.get(key).and_then(Value::as_str) {
            let event_type = event
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if event_type.contains("message") || event_type.contains("delta") {
                return Some(value.to_string());
            }
        }
    }

    None
}

fn describe_codex_activity(event_type: &str, event: &Value) -> Option<AgentActivityDescription> {
    if event_type == "thread.started" {
        return Some(create_activity_description(
            None,
            "Started Codex thread",
            "thinking",
            None,
            None,
        ));
    }

    if event_type.contains("turn.started") {
        return Some(create_activity_description(
            None,
            "Thinking through the request",
            "thinking",
            None,
            None,
        ));
    }

    if event_type.contains("turn.completed") {
        return Some(create_activity_description(
            None,
            "Finished reasoning pass",
            "thinking",
            None,
            None,
        ));
    }

    if event_type.contains("approval") {
        return Some(create_activity_description(
            extract_activity_id(event),
            &describe_approval_event(event).unwrap_or_else(|| "Approval requested".to_string()),
            "approval",
            extract_command(event),
            None,
        ));
    }

    if event_type.contains("exec") || event_type.contains("command") || event_type.contains("tool")
    {
        return Some(describe_command_activity(event));
    }

    if event_type.contains("item.started") || event_type.contains("item.completed") {
        let item_type = event.pointer("/item/type").and_then(Value::as_str)?;
        if item_type == "agent_reasoning" {
            return Some(create_activity_description(
                extract_activity_id(event),
                "Reasoning step updated",
                "thinking",
                None,
                None,
            ));
        }

        if item_type == "command_execution" {
            return Some(describe_command_activity(event));
        }
    }

    if event_type.contains("error") {
        return Some(create_activity_description(
            extract_activity_id(event),
            "Codex reported an error",
            "error",
            None,
            extract_error_output(event),
        ));
    }

    None
}

fn create_activity_description(
    activity_id: Option<String>,
    message: &str,
    kind: &'static str,
    detail: Option<String>,
    output: Option<String>,
) -> AgentActivityDescription {
    AgentActivityDescription {
        activity_id,
        message: message.to_string(),
        kind,
        detail,
        output,
    }
}

fn describe_command_activity(event: &Value) -> AgentActivityDescription {
    create_activity_description(
        extract_activity_id(event),
        "Running command",
        "tool",
        extract_command(event),
        extract_command_output(event),
    )
}

fn extract_activity_id(event: &Value) -> Option<String> {
    event
        .pointer("/item/id")
        .or_else(|| event.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn extract_command(event: &Value) -> Option<String> {
    event
        .pointer("/item/command")
        .or_else(|| event.get("command"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn extract_command_output(event: &Value) -> Option<String> {
    event
        .pointer("/item/aggregated_output")
        .or_else(|| event.pointer("/item/output"))
        .or_else(|| event.get("aggregated_output"))
        .or_else(|| event.get("output"))
        .and_then(Value::as_str)
        .filter(|output| !output.trim().is_empty())
        .map(str::to_string)
}

fn extract_error_output(event: &Value) -> Option<String> {
    event
        .pointer("/error/message")
        .or_else(|| event.get("message"))
        .and_then(Value::as_str)
        .filter(|output| !output.trim().is_empty())
        .map(str::to_string)
}

fn describe_approval_event(event: &Value) -> Option<String> {
    let command = event
        .pointer("/item/command")
        .or_else(|| event.get("command"))
        .and_then(Value::as_str);
    let reason = event
        .pointer("/item/reason")
        .or_else(|| event.get("reason"))
        .and_then(Value::as_str);

    match (command, reason) {
        (Some(command), Some(reason)) => {
            Some(format!("Approval requested for `{command}`: {reason}"))
        }
        (Some(command), None) => Some(format!("Approval requested for `{command}`")),
        (None, Some(reason)) => Some(format!("Approval requested: {reason}")),
        (None, None) => None,
    }
}

fn stream_text_response(stream_context: &AgentStreamContext, response: &str) {
    for token in response.split_inclusive(' ') {
        emit_agent_token(stream_context, token.to_string());
        std::thread::sleep(std::time::Duration::from_millis(18));
    }
}

fn append_permission_arguments(arguments: &mut Vec<String>, approval_mode: Option<&str>) {
    match approval_mode.unwrap_or("supervised") {
        "full-access" => {
            arguments.push("--dangerously-bypass-approvals-and-sandbox".to_string());
        }
        "auto-accept-edits" => {
            arguments.push("--ask-for-approval".to_string());
            arguments.push("never".to_string());
            arguments.push("--sandbox".to_string());
            arguments.push("workspace-write".to_string());
        }
        _ => {
            arguments.push("--ask-for-approval".to_string());
            arguments.push("on-request".to_string());
            arguments.push("--sandbox".to_string());
            arguments.push("workspace-write".to_string());
        }
    }
}

fn create_prompt_with_request_context(
    prompt: &str,
    rule_context: Option<&str>,
    work_mode: Option<&str>,
    approval_mode: Option<&str>,
) -> String {
    let normalized_rule_context = rule_context.unwrap_or_default().trim();
    let mode_instruction = create_work_mode_instruction(work_mode);
    let permission_instruction = create_permission_instruction(approval_mode);
    let shell_instruction = create_shell_instruction();

    if normalized_rule_context.is_empty()
        && mode_instruction.is_empty()
        && permission_instruction.is_empty()
        && shell_instruction.is_empty()
    {
        return prompt.to_string();
    }

    format!(
        "Follow these session settings while responding:\n\n{mode_instruction}\n{permission_instruction}\n{shell_instruction}\n\nFollow these global and project rules while responding:\n\n{normalized_rule_context}\n\nUser request:\n{prompt}"
    )
}

fn create_work_mode_instruction(work_mode: Option<&str>) -> &'static str {
    match work_mode.unwrap_or("build") {
        "plan" => {
            "Mode: Plan. Inspect, explain, and propose steps, but do not make file edits or run write-oriented commands unless the user explicitly switches to Build mode."
        }
        _ => "Mode: Build. Implement requested changes when enough context is available.",
    }
}

fn create_permission_instruction(approval_mode: Option<&str>) -> &'static str {
    match approval_mode.unwrap_or("supervised") {
        "full-access" => {
            "Permissions: Full access. Commands and edits may run without prompts."
        }
        "auto-accept-edits" => {
            "Permissions: Auto-accept edits. File edits may proceed automatically; pause before other sensitive actions."
        }
        _ => {
            "Permissions: Supervised. Requested file edits may proceed inside the selected project, with Codex CLI approval requests enabled for risky actions."
        }
    }
}

fn create_shell_instruction() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "Shell: Windows PowerShell may block .ps1 package-manager shims. Prefer .cmd launchers such as pnpm.cmd, npm.cmd, npx.cmd, yarn.cmd, and bun.cmd when running Node package commands."
    }

    #[cfg(not(target_os = "windows"))]
    {
        ""
    }
}

fn create_local_agent_response(
    prompt: &str,
    rule_context: Option<&str>,
    work_mode: Option<&str>,
) -> String {
    let prompt_with_rules =
        create_prompt_with_request_context(prompt, rule_context, work_mode, None);

    format!(
        "I received your request and kept it inside Codemind's approval-first workflow.\n\nPrompt summary: {prompt_with_rules}\n\nThis development build has the provider boundary in place for Codex CLI, Claude Code, Anthropic, OpenAI, OpenCode, and local agents. File writes are routed through diff proposals so you can review, approve, reject, or open the affected file before anything touches disk."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supervised_permissions_allow_requested_workspace_edits() {
        let mut arguments = Vec::new();

        append_permission_arguments(&mut arguments, Some("supervised"));

        assert_eq!(
            arguments,
            vec![
                "--ask-for-approval",
                "on-request",
                "--sandbox",
                "workspace-write"
            ]
        );
    }

    #[test]
    fn auto_accept_edits_never_prompts_for_approval() {
        let mut arguments = Vec::new();

        append_permission_arguments(&mut arguments, Some("auto-accept-edits"));

        assert_eq!(
            arguments,
            vec![
                "--ask-for-approval",
                "never",
                "--sandbox",
                "workspace-write"
            ]
        );
    }

    #[test]
    fn full_access_permissions_bypass_approvals_and_sandbox() {
        let mut arguments = Vec::new();

        append_permission_arguments(&mut arguments, Some("full-access"));

        assert_eq!(
            arguments,
            vec!["--dangerously-bypass-approvals-and-sandbox"]
        );
    }
}
