use crate::{
    models::{Message, MessageRole},
    services::agents,
    AppState,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_messages(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Message>, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .list_messages(session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn send_message(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    content: String,
    model: Option<String>,
    reasoning_effort: Option<String>,
    rule_context: Option<String>,
    work_mode: Option<String>,
    approval_mode: Option<String>,
) -> Result<Vec<Message>, String> {
    let database = state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?;
    let session = database
        .find_session(&session_id)
        .map_err(|error| error.to_string())?;

    database
        .create_message(session_id.clone(), MessageRole::User, content.clone())
        .map_err(|error| error.to_string())?;
    let assistant_message = database
        .create_message(session_id.clone(), MessageRole::Assistant, String::new())
        .map_err(|error| error.to_string())?;
    let messages = database
        .list_messages(session_id.clone())
        .map_err(|error| error.to_string())?;

    agents::stream_agent_response(
        app_handle,
        session_id,
        assistant_message.id,
        content,
        session.project_root,
        session.agent_id,
        model,
        reasoning_effort,
        rule_context,
        work_mode,
        approval_mode,
    );
    Ok(messages)
}

#[tauri::command]
pub fn stop_message_response(session_id: String) -> Result<(), String> {
    agents::stop_agent_response(&session_id)
}
