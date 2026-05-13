use crate::{
    models::{FileTreeNode, ProjectFile, ProjectSearchResult},
    services::projects,
    AppState,
};
use std::fs;
use tauri::State;

#[tauri::command]
pub fn set_session_project_root(
    state: State<'_, AppState>,
    session_id: String,
    project_root: String,
) -> Result<(), String> {
    let canonical_root = fs::canonicalize(project_root)
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .to_string();

    state
        .database
        .lock()
        .map_err(|_| "database lock failed".to_string())?
        .set_project_root(session_id, canonical_root)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_project_tree(project_root: String) -> Result<FileTreeNode, String> {
    projects::read_project_tree(project_root).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_project_directory(
    project_root: String,
    relative_path: String,
) -> Result<Vec<FileTreeNode>, String> {
    projects::read_project_directory(project_root, relative_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_project_file(
    project_root: String,
    relative_path: String,
) -> Result<ProjectFile, String> {
    projects::read_project_file(project_root, relative_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_project_files(
    project_root: String,
    query: String,
) -> Result<Vec<ProjectSearchResult>, String> {
    projects::search_project_files(project_root, query).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_project_file(
    project_root: String,
    relative_path: String,
    content: String,
) -> Result<ProjectFile, String> {
    projects::write_file_atomically(project_root.clone(), relative_path.clone(), content)
        .map_err(|error| error.to_string())?;
    projects::read_project_file(project_root, relative_path).map_err(|error| error.to_string())
}
