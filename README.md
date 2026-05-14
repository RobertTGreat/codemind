# Codemind

Codemind is a Tauri 2 desktop coding workspace built with React 19, TypeScript, Rust, and SQLite. It brings chat-driven coding, project browsing, Monaco editing, terminal commands, Git controls, Open VSX extension search, model/provider settings, approval flows, and persistent sessions into one local app.

## What It Does

- Streams Codex CLI responses into session timelines with thinking, command output, approvals, elapsed time, command counts, changed-file chips, stop, resume, and toast feedback.
- Browses and edits selected project folders with Monaco, lazy language registration, TextMate highlighting, dirty-tab protection, Save All, pending diff previews, and safer project path handling.
- Persists sessions, messages, diff proposals, and project metadata in SQLite.
- Provides a Git sidebar for repository status, staging, unstaging, discarding, committing, remote setup, pulling, pushing, and syncing.
- Includes a compact terminal panel with shell selection, command history, validated directory changes, timestamps, exit badges, and copyable output.
- Searches Open VSX extensions and installs VSIX packages through a supported local editor CLI.
- Supports provider/model selection, Codex CLI install/login actions, reasoning levels, and approval modes.

## Requirements

- Node.js and pnpm
- Rust and Cargo
- Tauri system dependencies for your OS
- Codex CLI for Codex-backed chat:

```sh
npm i -g @openai/codex
```

## Development

Install dependencies:

```sh
pnpm install
```

Run the web dev server:

```sh
pnpm dev
```

Run the desktop app:

```sh
pnpm tauri dev
```

Build the frontend:

```sh
pnpm build
```

Build the desktop app:

```sh
pnpm tauri build
```

## Checks

```sh
pnpm lint
pnpm test
pnpm cargo:test
pnpm cargo:clippy
pnpm check
```

## Architecture

- `src/domain` contains shared models and pure logic.
- `src/application` contains React Query use cases and cache behavior.
- `src/infrastructure/tauri` wraps Tauri invoke calls behind the repository port.
- `src/ui` contains the workspace, chat, editor, explorer, Git, terminal, settings, and Open VSX UI.
- `src-tauri/src/database` owns SQLite schema, migrations, and persistence.
- `src-tauri/src/commands` exposes Tauri commands for sessions, messages, projects, approvals, shell, and Git.
- `src-tauri/src/services` contains Codex CLI streaming, project filesystem safety, and provider CLI helpers.

## Safety Notes

Codemind intentionally works with local files, shell commands, Git, extension downloads, and AI-generated diffs. The app validates project paths, keeps filesystem operations scoped to selected projects, requires approval for proposed edits unless configured otherwise, enables SQLite foreign keys, and uses targeted cache invalidation so UI state stays predictable.

Test line.
