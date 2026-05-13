use crate::models::{FileTreeNode, ProjectFile, ProjectSearchResult};
use anyhow::{bail, Context, Result};
use ignore::WalkBuilder;
use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_DIRECTORY_ENTRIES: usize = 2_000;
const MAX_SEARCH_RESULTS: usize = 80;

pub fn read_project_tree(project_root: String) -> Result<FileTreeNode> {
    let root_path = fs::canonicalize(&project_root).context("project folder does not exist")?;
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
    let root_path = fs::canonicalize(&project_root).context("project folder does not exist")?;
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
    let root_path = fs::canonicalize(project_root)?;
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

    let root_path = fs::canonicalize(&project_root).context("project folder does not exist")?;
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
    let requested_relative_path = Path::new(relative_path);
    if requested_relative_path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        bail!("path must stay inside the selected project");
    }

    let candidate_path = project_root.join(requested_relative_path);
    let canonical_parent = candidate_path
        .parent()
        .map(fs::canonicalize)
        .transpose()?
        .unwrap_or_else(|| project_root.to_path_buf());

    if !canonical_parent.starts_with(project_root) {
        bail!("path escapes the selected project");
    }

    Ok(candidate_path)
}

pub fn write_file_atomically(
    project_root: String,
    relative_path: String,
    content: String,
) -> Result<()> {
    let root_path = fs::canonicalize(project_root)?;
    let target_path = resolve_project_path(&root_path, &relative_path)?;
    if let Some(parent_directory) = target_path.parent() {
        fs::create_dir_all(parent_directory)?;
    }

    let temporary_path = target_path.with_extension("codemind.tmp");
    fs::write(&temporary_path, content)?;
    fs::rename(temporary_path, target_path)?;
    Ok(())
}

fn read_project_directory_nodes(
    root_path: &Path,
    directory_path: &Path,
) -> Result<Vec<FileTreeNode>> {
    let mut child_nodes = fs::read_dir(directory_path)?
        .filter_map(|entry_result| entry_result.ok())
        .filter(|entry| should_show_directory_entry(entry.path().as_path()))
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
