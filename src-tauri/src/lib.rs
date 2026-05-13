mod commands;
mod database;
mod models;
mod services;

use database::Database;
use std::sync::Mutex;

pub struct AppState {
    database: Mutex<Database>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = Database::open().expect("failed to open Codemind database");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            database: Mutex::new(database),
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions::list_sessions,
            commands::sessions::create_session,
            commands::sessions::rename_session,
            commands::sessions::update_session_agent,
            commands::sessions::archive_session,
            commands::sessions::delete_session,
            commands::messages::list_messages,
            commands::messages::send_message,
            commands::messages::stop_message_response,
            commands::projects::set_session_project_root,
            commands::projects::read_project_tree,
            commands::projects::read_project_directory,
            commands::projects::read_project_file,
            commands::projects::search_project_files,
            commands::projects::save_project_file,
            commands::approvals::create_diff_proposal,
            commands::approvals::list_pending_diffs,
            commands::approvals::approve_diff_proposal,
            commands::approvals::reject_diff_proposal,
            commands::shell::run_shell_command,
            commands::shell::run_provider_login,
            commands::shell::get_provider_install_status,
            commands::shell::install_provider,
            commands::shell::install_open_vsx_extension,
            commands::git::read_git_repository_status,
            commands::git::git_init_repository,
            commands::git::git_set_remote,
            commands::git::git_stage_paths,
            commands::git::git_unstage_paths,
            commands::git::git_discard_paths,
            commands::git::git_commit,
            commands::git::git_pull,
            commands::git::git_push,
            commands::git::git_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codemind");
}
