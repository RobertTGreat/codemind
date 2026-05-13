use similar::{ChangeTag, TextDiff};

pub fn create_unified_diff(original_content: &str, proposed_content: &str) -> String {
    let diff = TextDiff::from_lines(original_content, proposed_content);
    diff.iter_all_changes()
        .map(|change| {
            let prefix = match change.tag() {
                ChangeTag::Delete => "-",
                ChangeTag::Insert => "+",
                ChangeTag::Equal => " ",
            };
            format!("{prefix}{change}")
        })
        .collect::<Vec<_>>()
        .join("")
}
