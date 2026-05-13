use crate::{models::Session, AppState};
use tauri::State;

#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .list_sessions()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_session(
    state: State<'_, AppState>,
    title: String,
    agent_id: String,
) -> Result<Session, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .create_session(title, agent_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn rename_session(
    state: State<'_, AppState>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .rename_session(session_id, title)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_session_agent(
    state: State<'_, AppState>,
    session_id: String,
    agent_id: String,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .update_session_agent(session_id, agent_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn archive_session(
    state: State<'_, AppState>,
    session_id: String,
    is_archived: bool,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .archive_session(session_id, is_archived)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .delete_session(session_id)
        .map_err(|error| error.to_string())
}
