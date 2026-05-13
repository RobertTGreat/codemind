use crate::{
    models::{DiffProposal, DiffStatus},
    services::{diffs, projects},
    AppState,
};
use tauri::State;

#[tauri::command]
pub fn create_diff_proposal(
    state: State<'_, AppState>,
    session_id: String,
    relative_path: String,
    proposed_content: String,
) -> Result<DiffProposal, String> {
    let project_root = {
        let database = state
            .database
            .lock()
            .map_err(|_| "database lock failed".to_string())?;
        let session = database
            .find_session(&session_id)
            .map_err(|error| error.to_string())?;
        session
            .project_root
            .ok_or_else(|| "select a project folder before creating file changes".to_string())?
    };
    let original_content = match projects::read_project_file(project_root, relative_path.clone()) {
        Ok(file) => file.content,
        Err(error) if projects::is_not_found_error(&error) => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    let diff_text = diffs::create_unified_diff(&original_content, &proposed_content);

    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .create_diff_proposal(
            session_id,
            relative_path,
            original_content,
            proposed_content,
            diff_text,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_pending_diffs(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<DiffProposal>, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .list_pending_diffs(session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn approve_diff_proposal(
    state: State<'_, AppState>,
    proposal_id: String,
) -> Result<(), String> {
    let (proposal, project_root) = {
        let database = state
            .database
            .lock()
            .map_err(|_| "database lock failed".to_string())?;
        let proposal = database
            .find_diff_proposal(&proposal_id)
            .map_err(|error| error.to_string())?;
        let session = database
            .find_session(&proposal.session_id)
            .map_err(|error| error.to_string())?;
        let project_root = session
            .project_root
            .ok_or_else(|| "session has no selected project folder".to_string())?;
        (proposal, project_root)
    };

    projects::write_file_atomically(
        project_root,
        proposal.relative_path,
        proposal.proposed_content,
    )
    .map_err(|error| error.to_string())?;
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .update_diff_status(proposal_id, DiffStatus::Approved)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reject_diff_proposal(state: State<'_, AppState>, proposal_id: String) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .update_diff_status(proposal_id, DiffStatus::Rejected)
        .map_err(|error| error.to_string())
}
