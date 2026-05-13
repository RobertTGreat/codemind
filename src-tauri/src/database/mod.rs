use crate::models::{DiffProposal, DiffStatus, Message, MessageRole, Session};
use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use std::fs;
use uuid::Uuid;

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open() -> Result<Self> {
        let data_directory = dirs_next::data_dir()
            .context("could not resolve user data directory")?
            .join("Codemind");
        fs::create_dir_all(&data_directory)?;
        let database_path = data_directory.join("codemind.sqlite");
        let connection = Connection::open(database_path)?;
        let database = Self { connection };
        database.migrate()?;
        Ok(database)
    }

    fn migrate(&self) -> Result<()> {
        self.connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                project_root TEXT,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS diff_proposals (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                original_content TEXT NOT NULL,
                proposed_content TEXT NOT NULL,
                diff_text TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            ",
        )?;
        Ok(())
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>> {
        let mut statement = self.connection.prepare(
            "SELECT id, title, agent_id, project_root, is_archived, created_at, updated_at
             FROM sessions
             ORDER BY updated_at DESC",
        )?;

        let sessions = statement
            .query_map([], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    agent_id: row.get(2)?,
                    project_root: row.get(3)?,
                    is_archived: row.get::<_, i64>(4)? == 1,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(sessions)
    }

    pub fn create_session(&self, title: String, agent_id: String) -> Result<Session> {
        let now = Utc::now().to_rfc3339();
        let session = Session {
            id: Uuid::new_v4().to_string(),
            title,
            agent_id,
            project_root: None,
            is_archived: false,
            created_at: now.clone(),
            updated_at: now,
        };

        self.connection.execute(
            "INSERT INTO sessions (id, title, agent_id, project_root, is_archived, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                session.id,
                session.title,
                session.agent_id,
                session.project_root,
                0,
                session.created_at,
                session.updated_at
            ],
        )?;

        Ok(session)
    }

    pub fn rename_session(&self, session_id: String, title: String) -> Result<()> {
        self.touch_session_with_update(
            "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, Utc::now().to_rfc3339(), session_id],
        )
    }

    pub fn update_session_agent(&self, session_id: String, agent_id: String) -> Result<()> {
        self.touch_session_with_update(
            "UPDATE sessions SET agent_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![agent_id, Utc::now().to_rfc3339(), session_id],
        )
    }

    pub fn archive_session(&self, session_id: String, is_archived: bool) -> Result<()> {
        self.touch_session_with_update(
            "UPDATE sessions SET is_archived = ?1, updated_at = ?2 WHERE id = ?3",
            params![
                if is_archived { 1 } else { 0 },
                Utc::now().to_rfc3339(),
                session_id
            ],
        )
    }

    pub fn delete_session(&self, session_id: String) -> Result<()> {
        self.connection
            .execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
        Ok(())
    }

    pub fn set_project_root(&self, session_id: String, project_root: String) -> Result<()> {
        self.touch_session_with_update(
            "UPDATE sessions SET project_root = ?1, updated_at = ?2 WHERE id = ?3",
            params![project_root, Utc::now().to_rfc3339(), session_id],
        )
    }

    pub fn find_session(&self, session_id: &str) -> Result<Session> {
        self.connection
            .query_row(
                "SELECT id, title, agent_id, project_root, is_archived, created_at, updated_at
                 FROM sessions
                 WHERE id = ?1",
                params![session_id],
                |row| {
                    Ok(Session {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        agent_id: row.get(2)?,
                        project_root: row.get(3)?,
                        is_archived: row.get::<_, i64>(4)? == 1,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .context("session not found")
    }

    pub fn list_messages(&self, session_id: String) -> Result<Vec<Message>> {
        let mut statement = self.connection.prepare(
            "SELECT id, session_id, role, content, created_at
             FROM messages
             WHERE session_id = ?1
             ORDER BY created_at ASC",
        )?;

        let messages = statement
            .query_map(params![session_id], |row| {
                let role: String = row.get(2)?;
                Ok(Message {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: MessageRole::from_database_value(&role),
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(messages)
    }

    pub fn create_message(
        &self,
        session_id: String,
        role: MessageRole,
        content: String,
    ) -> Result<Message> {
        let now = Utc::now().to_rfc3339();
        let message = Message {
            id: Uuid::new_v4().to_string(),
            session_id,
            role,
            content,
            created_at: now,
        };

        self.connection.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                message.id,
                message.session_id,
                message.role.as_str(),
                message.content,
                message.created_at
            ],
        )?;
        self.connection.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), message.session_id],
        )?;

        Ok(message)
    }

    pub fn update_message_content(&self, message_id: String, content: String) -> Result<()> {
        self.connection.execute(
            "UPDATE messages SET content = ?1 WHERE id = ?2",
            params![content, message_id],
        )?;
        Ok(())
    }

    pub fn create_diff_proposal(
        &self,
        session_id: String,
        relative_path: String,
        original_content: String,
        proposed_content: String,
        diff_text: String,
    ) -> Result<DiffProposal> {
        let proposal = DiffProposal {
            id: Uuid::new_v4().to_string(),
            session_id,
            relative_path,
            original_content,
            proposed_content,
            diff_text,
            status: DiffStatus::Pending,
            created_at: Utc::now().to_rfc3339(),
        };

        self.connection.execute(
            "INSERT INTO diff_proposals
             (id, session_id, relative_path, original_content, proposed_content, diff_text, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                proposal.id,
                proposal.session_id,
                proposal.relative_path,
                proposal.original_content,
                proposal.proposed_content,
                proposal.diff_text,
                proposal.status.as_str(),
                proposal.created_at
            ],
        )?;

        Ok(proposal)
    }

    pub fn list_pending_diffs(&self, session_id: String) -> Result<Vec<DiffProposal>> {
        self.list_diff_proposals(session_id, Some(DiffStatus::Pending))
    }

    pub fn find_diff_proposal(&self, proposal_id: &str) -> Result<DiffProposal> {
        self.connection
            .query_row(
                "SELECT id, session_id, relative_path, original_content, proposed_content, diff_text, status, created_at
                 FROM diff_proposals
                 WHERE id = ?1",
                params![proposal_id],
                |row| {
                    let status: String = row.get(6)?;
                    Ok(DiffProposal {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        relative_path: row.get(2)?,
                        original_content: row.get(3)?,
                        proposed_content: row.get(4)?,
                        diff_text: row.get(5)?,
                        status: DiffStatus::from_database_value(&status),
                        created_at: row.get(7)?,
                    })
                },
            )
            .context("diff proposal not found")
    }

    pub fn update_diff_status(&self, proposal_id: String, status: DiffStatus) -> Result<()> {
        self.connection.execute(
            "UPDATE diff_proposals SET status = ?1 WHERE id = ?2",
            params![status.as_str(), proposal_id],
        )?;
        Ok(())
    }

    fn list_diff_proposals(
        &self,
        session_id: String,
        status: Option<DiffStatus>,
    ) -> Result<Vec<DiffProposal>> {
        let mut query = String::from(
            "SELECT id, session_id, relative_path, original_content, proposed_content, diff_text, status, created_at
             FROM diff_proposals
             WHERE session_id = ?1",
        );
        if status.is_some() {
            query.push_str(" AND status = ?2");
        }
        query.push_str(" ORDER BY created_at DESC");

        let mut statement = self.connection.prepare(&query)?;
        let proposals = match status {
            Some(status) => statement
                .query_map(params![session_id, status.as_str()], map_diff_proposal)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            None => statement
                .query_map(params![session_id], map_diff_proposal)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
        };

        Ok(proposals)
    }

    fn touch_session_with_update<P: rusqlite::Params>(&self, query: &str, params: P) -> Result<()> {
        self.connection.execute(query, params)?;
        Ok(())
    }
}

fn map_diff_proposal(row: &rusqlite::Row<'_>) -> rusqlite::Result<DiffProposal> {
    let status: String = row.get(6)?;
    Ok(DiffProposal {
        id: row.get(0)?,
        session_id: row.get(1)?,
        relative_path: row.get(2)?,
        original_content: row.get(3)?,
        proposed_content: row.get(4)?,
        diff_text: row.get(5)?,
        status: DiffStatus::from_database_value(&status),
        created_at: row.get(7)?,
    })
}
