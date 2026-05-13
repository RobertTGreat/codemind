use crate::models::{FileTreeNode, ProjectFile, ProjectSearchResult};
use anyhow::{bail, Context, Result};
use ignore::WalkBuilder;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_DIRECTORY_ENTRIES: usize = 2_000;
const MAX_SEARCH_RESULTS: usize = 80;

pub fn read_project_tree(project_root: String) -> Result<FileTreeNode> {
    let root_path = canonicalize_project_root(&project_root)?;
    let root_name = root_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Project")
        .to_string();

    Ok(FileTreeNode {
        id: root_path.to_string_lossy().to_string(),
        name: root_name,
        relative_path: String::new(),
        absolute_path: root_path.to_string_lossy().to_string(),
        is_directory: true,
        children: read_project_directory_nodes(&root_path, &root_path)?,
    })
}

pub fn read_project_directory(
    project_root: String,
    relative_path: String,
) -> Result<Vec<FileTreeNode>> {
    let root_path = canonicalize_project_root(&project_root)?;
    let directory_path = if relative_path.trim().is_empty() {
        root_path.clone()
    } else {
        resolve_project_path(&root_path, &relative_path)?
    };

    if !directory_path.is_dir() {
        bail!("selected path is not a folder");
    }

    read_project_directory_nodes(&root_path, &directory_path)
}

pub fn read_project_file(project_root: String, relative_path: String) -> Result<ProjectFile> {
    let root_path = canonicalize_project_root(&project_root)?;
    let file_path = resolve_project_path(&root_path, &relative_path)?;
    let metadata = fs::metadata(&file_path)?;
    if metadata.len() > MAX_FILE_BYTES {
        bail!("file is larger than the Codemind preview limit");
    }

    let content = fs::read_to_string(&file_path).context("file is not valid UTF-8 text")?;
    Ok(ProjectFile {
        relative_path,
        absolute_path: file_path.to_string_lossy().to_string(),
        language: detect_language(&file_path),
        content,
    })
}

pub fn search_project_files(
    project_root: String,
    query: String,
) -> Result<Vec<ProjectSearchResult>> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let root_path = canonicalize_project_root(&project_root)?;
    let mut results = Vec::new();

    for entry in WalkBuilder::new(&root_path)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| should_show_directory_entry(entry.path()))
        .build()
        .filter_map(|entry_result| entry_result.ok())
    {
        let path = entry.path();
        if path == root_path {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let relative_path = path
            .strip_prefix(&root_path)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        if !file_name.to_lowercase().contains(&normalized_query)
            && !relative_path.to_lowercase().contains(&normalized_query)
        {
            continue;
        }

        let parent_path = path
            .parent()
            .and_then(|parent| parent.strip_prefix(&root_path).ok())
            .map(|parent| parent.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();

        results.push(ProjectSearchResult {
            name: file_name.to_string(),
            relative_path,
            parent_path,
            is_directory: path.is_dir(),
        });

        if results.len() >= MAX_SEARCH_RESULTS {
            break;
        }
    }

    Ok(results)
}

pub fn resolve_project_path(project_root: &Path, relative_path: &str) -> Result<PathBuf> {
    let canonical_project_root = fs::canonicalize(project_root)
        .context("project folder does not exist")?;
    let requested_relative_path = Path::new(relative_path);
    if requested_relative_path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        bail!("path must stay inside the selected project");
    }

    let candidate_path = canonical_project_root.join(requested_relative_path);
    if candidate_path.exists() {
        let canonical_candidate_path = fs::canonicalize(&candidate_path)?;
        if !canonical_candidate_path.starts_with(&canonical_project_root) {
            bail!("path escapes the selected project");
        }
        return Ok(canonical_candidate_path);
    }

    let canonical_parent = candidate_path
        .parent()
        .map(|parent_path| {
            canonicalize_existing_ancestor(parent_path, &canonical_project_root)
        })
        .transpose()?
        .unwrap_or_else(|| canonical_project_root.clone());

    if !canonical_parent.starts_with(&canonical_project_root) {
        bail!("path escapes the selected project");
    }

    Ok(candidate_path)
}

pub fn write_file_atomically(
    project_root: String,
    relative_path: String,
    content: String,
) -> Result<()> {
    let root_path = canonicalize_project_root(&project_root)?;
    let target_path = resolve_project_path(&root_path, &relative_path)?;
    if let Some(parent_directory) = target_path.parent() {
        fs::create_dir_all(parent_directory)?;
    }

    let parent_directory = target_path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("target file has no parent folder"))?;
    let temporary_path = parent_directory.join(format!(
        ".{}.{}.codemind.tmp",
        target_path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .unwrap_or("file"),
        Uuid::new_v4()
    ));

    let write_result = (|| -> Result<()> {
        let mut temporary_file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)?;
        temporary_file.write_all(content.as_bytes())?;
        temporary_file.flush()?;
        temporary_file.sync_all()?;
        drop(temporary_file);
        fs::rename(&temporary_path, &target_path)?;
        if let Ok(parent_directory_handle) = fs::File::open(parent_directory) {
            let _ = parent_directory_handle.sync_all();
        }
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    write_result?;
    Ok(())
}

pub fn is_not_found_error(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<std::io::Error>()
            .is_some_and(|io_error| io_error.kind() == std::io::ErrorKind::NotFound)
    })
}

fn canonicalize_project_root(project_root: &str) -> Result<PathBuf> {
    fs::canonicalize(project_root).context("project folder does not exist")
}

fn canonicalize_existing_ancestor(
    requested_parent_path: &Path,
    canonical_project_root: &Path,
) -> Result<PathBuf> {
    let mut current_path = requested_parent_path;
    loop {
        if current_path.exists() {
            return fs::canonicalize(current_path)
                .context("failed to verify target folder stays inside project");
        }

        if current_path == canonical_project_root {
            return Ok(canonical_project_root.to_path_buf());
        }

        current_path = current_path
            .parent()
            .ok_or_else(|| anyhow::anyhow!("path must stay inside the selected project"))?;
    }
}

fn read_project_directory_nodes(
    root_path: &Path,
    directory_path: &Path,
) -> Result<Vec<FileTreeNode>> {
    let mut child_nodes = fs::read_dir(directory_path)?
        .filter_map(|entry_result| entry_result.ok())
        .filter(|entry| should_show_directory_entry(entry.path().as_path()))
        .filter(|entry| is_path_inside_project(root_path, entry.path().as_path()))
        .take(MAX_DIRECTORY_ENTRIES)
        .map(|entry| {
            let child_path = entry.path();
            let child_name = entry.file_name().to_string_lossy().to_string();
            let is_directory = child_path.is_dir();
            let relative_path = child_path
                .strip_prefix(root_path)
                .unwrap_or(child_path.as_path())
                .to_string_lossy()
                .replace('\\', "/");

            FileTreeNode {
                id: child_path.to_string_lossy().to_string(),
                name: child_name,
                relative_path,
                absolute_path: child_path.to_string_lossy().to_string(),
                is_directory,
                children: Vec::new(),
            }
        })
        .collect::<Vec<_>>();

    child_nodes.sort_by(|left_node, right_node| {
        right_node
            .is_directory
            .cmp(&left_node.is_directory)
            .then_with(|| {
                left_node
                    .name
                    .to_lowercase()
                    .cmp(&right_node.name.to_lowercase())
            })
    });

    Ok(child_nodes)
}

fn should_show_directory_entry(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    !matches!(
        file_name,
        ".git"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".next"
            | ".turbo"
            | ".cache"
            | ".vite"
    )
}

fn is_path_inside_project(root_path: &Path, path: &Path) -> bool {
    fs::canonicalize(path)
        .map(|canonical_path| canonical_path.starts_with(root_path))
        .unwrap_or(true)
}

fn detect_language(file_path: &Path) -> String {
    match file_path
        .extension()
        .and_then(|extension| extension.to_str())
    {
        Some("rs") => "rust",
        Some("tsx") => "typescriptreact",
        Some("ts") => "typescript",
        Some("jsx") => "javascriptreact",
        Some("js") => "javascript",
        Some("json") => "json",
        Some("md") => "markdown",
        Some("css") => "css",
        Some("html") => "html",
        Some("toml") => "toml",
        Some("yaml" | "yml") => "yaml",
        _ => "plaintext",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_project_path_rejects_parent_segments() {
        let project_root = create_test_directory("path-parent");

        let error = resolve_project_path(&project_root, "../outside.txt")
            .expect_err("parent traversal should fail");

        assert!(error.to_string().contains("selected project"));
        let _ = fs::remove_dir_all(project_root);
    }

    #[test]
    fn write_file_atomically_replaces_existing_file() {
        let project_root = create_test_directory("atomic-write");
        fs::write(project_root.join("note.txt"), "old").expect("old file written");

        write_file_atomically(
            project_root.to_string_lossy().to_string(),
            "note.txt".to_string(),
            "new".to_string(),
        )
        .expect("file can be written atomically");

        assert_eq!(
            fs::read_to_string(project_root.join("note.txt")).expect("file can be read"),
            "new"
        );
        assert!(
            fs::read_dir(&project_root)
                .expect("project can be listed")
                .all(|entry| !entry
                    .expect("entry can be read")
                    .file_name()
                    .to_string_lossy()
                    .contains("codemind.tmp"))
        );
        let _ = fs::remove_dir_all(project_root);
    }

    #[cfg(unix)]
    #[test]
    fn resolve_project_path_rejects_symlink_that_points_outside_project() {
        use std::os::unix::fs::symlink;

        let project_root = create_test_directory("symlink-root");
        let outside_root = create_test_directory("symlink-outside");
        let outside_file = outside_root.join("secret.txt");
        fs::write(&outside_file, "secret").expect("outside file written");
        symlink(&outside_file, project_root.join("linked-secret.txt"))
            .expect("symlink created");

        let error = resolve_project_path(&project_root, "linked-secret.txt")
            .expect_err("outside symlink should fail");

        assert!(error.to_string().contains("escapes"));
        let _ = fs::remove_dir_all(project_root);
        let _ = fs::remove_dir_all(outside_root);
    }

    fn create_test_directory(prefix: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("codemind-{prefix}-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("test directory created");
        fs::canonicalize(path).expect("test directory canonicalized")
    }
}
