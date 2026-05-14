use crate::models::{AgentActivity, DiffProposal, DiffStatus, Message, MessageRole, Session};
use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, params_from_iter, Connection};
use std::fs;
use uuid::Uuid;

pub struct Database {
    connection: Connection,
}

pub struct AgentActivityUpsert {
    pub activity_id: String,
    pub session_id: String,
    pub message_id: String,
    pub activity_message: String,
    pub activity_kind: String,
    pub activity_detail: Option<String>,
    pub activity_output: Option<String>,
}

impl Database {
    pub fn open() -> Result<Self> {
        let data_directory = dirs_next::data_dir()
            .context("could not resolve user data directory")?
            .join("Codemind");
        fs::create_dir_all(&data_directory)?;
        let database_path = data_directory.join("codemind.sqlite");
        let connection = Connection::open(database_path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let database = Self { connection };
        database.migrate()?;
        Ok(database)
    }

    #[cfg(test)]
    fn open_in_memory() -> Result<Self> {
        let connection = Connection::open_in_memory()?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
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

            CREATE TABLE IF NOT EXISTS agent_activities (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                activity_message TEXT NOT NULL,
                activity_kind TEXT NOT NULL,
                activity_detail TEXT,
                activity_output TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
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

            CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
                ON sessions(updated_at);
            CREATE INDEX IF NOT EXISTS idx_messages_session_created
                ON messages(session_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_agent_activities_message_created
                ON agent_activities(message_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_diff_proposals_session_status_created
                ON diff_proposals(session_id, status, created_at);
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
            .query_map(params![session_id], map_message)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(messages)
    }

    pub fn list_messages_page(
        &self,
        session_id: String,
        before_created_at: Option<String>,
        limit: i64,
    ) -> Result<Vec<Message>> {
        let limit = limit.clamp(1, 100);

        let messages = if let Some(before_created_at) = before_created_at {
            let mut statement = self.connection.prepare(
                "SELECT id, session_id, role, content, created_at
                 FROM messages
                 WHERE session_id = ?1 AND created_at < ?2
                 ORDER BY created_at DESC
                 LIMIT ?3",
            )?;
            let page_messages = statement
                .query_map(params![session_id, before_created_at, limit], map_message)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            page_messages
        } else {
            let mut statement = self.connection.prepare(
                "SELECT id, session_id, role, content, created_at
                 FROM messages
                 WHERE session_id = ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
            )?;
            let page_messages = statement
                .query_map(params![session_id, limit], map_message)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            page_messages
        };

        Ok(messages.into_iter().rev().collect())
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

    pub fn upsert_agent_activity(&self, activity: AgentActivityUpsert) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO agent_activities
             (id, session_id, message_id, activity_message, activity_kind, activity_detail, activity_output, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                activity_message = excluded.activity_message,
                activity_kind = excluded.activity_kind,
                activity_detail = COALESCE(excluded.activity_detail, agent_activities.activity_detail),
                activity_output = COALESCE(excluded.activity_output, agent_activities.activity_output),
                updated_at = excluded.updated_at",
            params![
                activity.activity_id,
                activity.session_id,
                activity.message_id,
                activity.activity_message,
                activity.activity_kind,
                activity.activity_detail,
                activity.activity_output,
                now,
                now,
            ],
        )?;

        Ok(())
    }

    pub fn list_agent_activities(
        &self,
        session_id: String,
        message_ids: Vec<String>,
    ) -> Result<Vec<AgentActivity>> {
        if message_ids.is_empty() {
            return Ok(Vec::new());
        }

        let placeholders = (0..message_ids.len())
            .map(|index| format!("?{}", index + 2))
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT id, session_id, message_id, activity_message, activity_kind, activity_detail, activity_output, created_at, updated_at
             FROM agent_activities
             WHERE session_id = ?1 AND message_id IN ({placeholders})
             ORDER BY created_at ASC"
        );
        let mut statement = self.connection.prepare(&query)?;
        let query_parameters =
            std::iter::once(session_id.as_str()).chain(message_ids.iter().map(String::as_str));
        let activities = statement
            .query_map(params_from_iter(query_parameters), map_agent_activity)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(activities)
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

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    let role: String = row.get(2)?;

    Ok(Message {
        id: row.get(0)?,
        session_id: row.get(1)?,
        role: MessageRole::from_database_value(&role),
        content: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn map_agent_activity(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentActivity> {
    Ok(AgentActivity {
        id: row.get(0)?,
        session_id: row.get(1)?,
        message_id: row.get(2)?,
        message: row.get(3)?,
        kind: row.get(4)?,
        detail: row.get(5)?,
        output: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleting_session_cascades_messages_and_diff_proposals() {
        let database = Database::open_in_memory().expect("database opens");
        let session = database
            .create_session("Cascade test".to_string(), "codex-cli".to_string())
            .expect("session is created");
        database
            .create_message(session.id.clone(), MessageRole::User, "hello".to_string())
            .expect("message is created");
        database
            .create_diff_proposal(
                session.id.clone(),
                "README.md".to_string(),
                "old".to_string(),
                "new".to_string(),
                "diff".to_string(),
            )
            .expect("diff proposal is created");

        database
            .delete_session(session.id.clone())
            .expect("session is deleted");

        let message_count: i64 = database
            .connection
            .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))
            .expect("message count can be read");
        let diff_count: i64 = database
            .connection
            .query_row("SELECT COUNT(*) FROM diff_proposals", [], |row| row.get(0))
            .expect("diff count can be read");

        assert_eq!(message_count, 0);
        assert_eq!(diff_count, 0);
    }

    #[test]
    fn list_agent_activities_returns_visible_message_activity() {
        let database = Database::open_in_memory().expect("database opens");
        let session = database
            .create_session("Activity test".to_string(), "codex-cli".to_string())
            .expect("session is created");
        let message = database
            .create_message(session.id.clone(), MessageRole::Assistant, String::new())
            .expect("message is created");

        database
            .upsert_agent_activity(AgentActivityUpsert {
                activity_id: "activity-1".to_string(),
                session_id: session.id.clone(),
                message_id: message.id.clone(),
                activity_message: "Running command".to_string(),
                activity_kind: "tool".to_string(),
                activity_detail: Some("pnpm test".to_string()),
                activity_output: Some("passed".to_string()),
            })
            .expect("activity is created");
        database
            .upsert_agent_activity(AgentActivityUpsert {
                activity_id: "activity-1".to_string(),
                session_id: session.id.clone(),
                message_id: message.id.clone(),
                activity_message: "Running command".to_string(),
                activity_kind: "tool".to_string(),
                activity_detail: None,
                activity_output: Some("still passed".to_string()),
            })
            .expect("activity is updated");

        let activities = database
            .list_agent_activities(session.id, vec![message.id])
            .expect("activities can be listed");

        assert_eq!(activities.len(), 1);
        assert_eq!(activities[0].detail.as_deref(), Some("pnpm test"));
        assert_eq!(activities[0].output.as_deref(), Some("still passed"));
    }

    #[test]
    fn list_messages_page_returns_latest_page_in_ascending_order() {
        let database = Database::open_in_memory().expect("database opens");
        let session = database
            .create_session("Paging test".to_string(), "codex-cli".to_string())
            .expect("session is created");
        let first_message = database
            .create_message(session.id.clone(), MessageRole::User, "one".to_string())
            .expect("first message is created");
        let second_message = database
            .create_message(
                session.id.clone(),
                MessageRole::Assistant,
                "two".to_string(),
            )
            .expect("second message is created");
        let third_message = database
            .create_message(session.id.clone(), MessageRole::User, "three".to_string())
            .expect("third message is created");

        database
            .connection
            .execute(
                "UPDATE messages SET created_at = ?1 WHERE id = ?2",
                params!["2026-01-01T00:00:00Z", first_message.id],
            )
            .expect("first timestamp is updated");
        database
            .connection
            .execute(
                "UPDATE messages SET created_at = ?1 WHERE id = ?2",
                params!["2026-01-01T00:01:00Z", second_message.id],
            )
            .expect("second timestamp is updated");
        database
            .connection
            .execute(
                "UPDATE messages SET created_at = ?1 WHERE id = ?2",
                params!["2026-01-01T00:02:00Z", third_message.id],
            )
            .expect("third timestamp is updated");

        let latest_page = database
            .list_messages_page(session.id.clone(), None, 2)
            .expect("latest page can be listed");
        let earlier_page = database
            .list_messages_page(
                session.id,
                latest_page
                    .first()
                    .map(|message| message.created_at.clone()),
                2,
            )
            .expect("earlier page can be listed");

        assert_eq!(
            latest_page
                .iter()
                .map(|message| message.content.as_str())
                .collect::<Vec<_>>(),
            vec!["two", "three"]
        );
        assert_eq!(
            earlier_page
                .iter()
                .map(|message| message.content.as_str())
                .collect::<Vec<_>>(),
            vec!["one"]
        );
    }
}
