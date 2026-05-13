use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub agent_id: String,
    pub project_root: Option<String>,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: MessageRole,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

impl MessageRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "tool",
        }
    }

    pub fn from_database_value(value: &str) -> Self {
        match value {
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            "tool" => MessageRole::Tool,
            _ => MessageRole::User,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub is_directory: bool,
    pub children: Vec<FileTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub relative_path: String,
    pub absolute_path: String,
    pub content: String,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSearchResult {
    pub name: String,
    pub relative_path: String,
    pub parent_path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffProposal {
    pub id: String,
    pub session_id: String,
    pub relative_path: String,
    pub original_content: String,
    pub proposed_content: String,
    pub diff_text: String,
    pub status: DiffStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffStatus {
    Pending,
    Approved,
    Rejected,
}

impl DiffStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiffStatus::Pending => "pending",
            DiffStatus::Approved => "approved",
            DiffStatus::Rejected => "rejected",
        }
    }

    pub fn from_database_value(value: &str) -> Self {
        match value {
            "approved" => DiffStatus::Approved,
            "rejected" => DiffStatus::Rejected,
            _ => DiffStatus::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTokenEvent {
    pub session_id: String,
    pub message_id: String,
    pub token: String,
    pub is_complete: bool,
    pub activity_id: Option<String>,
    pub activity_message: Option<String>,
    pub activity_kind: Option<String>,
    pub activity_detail: Option<String>,
    pub activity_output: Option<String>,
}
