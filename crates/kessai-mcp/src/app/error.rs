use kessai_core::error::KessaiCoreError;
use schemars::JsonSchema;
use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SideEffects {
    None,
    Applied,
    Unknown,
}

#[derive(Debug, Clone, Copy)]
pub enum ErrorKind {
    Validation,
    NotFound,
    Conflict,
    Confirmation,
    Io,
    Internal,
}

#[derive(Debug, Clone, thiserror::Error)]
#[error("{message}")]
pub struct AppError {
    pub kind: ErrorKind,
    pub message: String,
    pub field: Option<String>,
    pub hint: Option<String>,
    pub side_effects: SideEffects,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ErrorBody {
    /// Structured domain error; tool errors are not transport errors.
    pub error: ErrorDetail,
}
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ErrorDetail {
    /// Stable machine-readable error code.
    pub code: String,
    /// Human-readable failure explanation.
    pub message: String,
    /// Invalid input field, when applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    /// Actionable recovery instruction, including a valid input example.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// Whether domain or filesystem changes occurred before failure.
    pub side_effects: SideEffects,
}
impl AppError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            field: None,
            hint: None,
            side_effects: if matches!(kind, ErrorKind::Internal) {
                SideEffects::Unknown
            } else {
                SideEffects::None
            },
        }
    }
    pub fn validation(field: &str, message: impl Into<String>, hint: impl Into<String>) -> Self {
        Self::new(ErrorKind::Validation, message)
            .with_field(field)
            .with_hint(hint)
    }
    pub fn with_field(mut self, field: impl Into<String>) -> Self {
        self.field = Some(field.into());
        self
    }
    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }
    pub fn with_side_effects(mut self, side_effects: SideEffects) -> Self {
        self.side_effects = side_effects;
        self
    }
    pub fn code(&self) -> &'static str {
        match self.kind {
            ErrorKind::Validation => "validation_error",
            ErrorKind::NotFound => "not_found",
            ErrorKind::Conflict => "conflict",
            ErrorKind::Confirmation => "confirmation_required",
            ErrorKind::Io => "io_error",
            ErrorKind::Internal => "internal_error",
        }
    }
    pub fn exit_code(&self) -> u8 {
        match self.kind {
            ErrorKind::Validation => 2,
            ErrorKind::NotFound => 3,
            ErrorKind::Conflict => 4,
            ErrorKind::Confirmation => 5,
            ErrorKind::Io => 6,
            ErrorKind::Internal => 1,
        }
    }
    pub fn body(&self) -> ErrorBody {
        ErrorBody {
            error: ErrorDetail {
                code: self.code().into(),
                message: self.message.clone(),
                field: self.field.clone(),
                hint: self.hint.clone(),
                side_effects: self.side_effects,
            },
        }
    }
    pub fn json(&self) -> serde_json::Value {
        serde_json::json!(self.body())
    }
    // WP1: superseded adapter constructors; retained only until adapter cutover.
    #[allow(non_snake_case)]
    pub fn Validation(message: String) -> Self {
        Self::validation(
            "input",
            message,
            "Use a valid input, for example amount=9.99; consult command help for fields.",
        )
    }
    #[allow(non_snake_case)]
    pub fn Internal(message: String) -> Self {
        Self::new(ErrorKind::Internal, message)
    }
    #[allow(non_snake_case)]
    pub fn Io(message: String) -> Self {
        Self::new(ErrorKind::Io, message)
    }
}
impl From<KessaiCoreError> for AppError {
    fn from(error: KessaiCoreError) -> Self {
        match error {
            KessaiCoreError::Validation(message) => {
                let field = validation_field(&message);
                let hint = example_hint(field);
                Self::validation(field, message, hint)
            }
            KessaiCoreError::NotFound(message) => Self::new(ErrorKind::NotFound, message),
            KessaiCoreError::Conflict(message) => Self::new(ErrorKind::Conflict, message),
            KessaiCoreError::CannotDeleteDefault => {
                Self::new(ErrorKind::Conflict, "default categories cannot be deleted")
            }
            KessaiCoreError::Import(message) => Self::validation(
                "path",
                message,
                "Use a valid exported backup, for example /tmp/kessai-backup.json.",
            ),
            other => Self::new(ErrorKind::Internal, other.to_string()),
        }
    }
}
impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::new(
            if error.kind() == std::io::ErrorKind::NotFound {
                ErrorKind::NotFound
            } else {
                ErrorKind::Io
            },
            error.to_string(),
        )
    }
}
impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::validation(
            "path",
            format!("invalid backup JSON: {error}"),
            "Use a JSON file produced by backup_export, for example /tmp/kessai-backup.json.",
        )
    }
}
fn validation_field(message: &str) -> &'static str {
    for field in [
        "cancellation_reason",
        "next_payment_date",
        "trial_end_date",
        "shared_count",
        "billing_day",
        "notification_time",
        "notification_days_before",
        "notification_advance_days",
        "monthly_budget",
        "paid_at",
        "due_date",
        "currency",
        "amount",
        "notes",
        "color",
        "name",
    ] {
        if message.contains(field) {
            return field;
        }
    }
    if message.contains("next payment date") {
        return "next_payment_date";
    }
    if message.contains("due date") {
        return "due_date";
    }
    if message.contains("last four") {
        return "last_four";
    }
    "path"
}
pub(super) fn example_hint(field: &str) -> String {
    let example = match field {
        "name" | "icon" => {
            "a nonempty value, for example name=Netflix or icon=box (1–100 characters)"
        }
        "amount" => "amount=9.99 (finite and nonnegative)",
        "currency" => "currency=USD",
        "notes" | "cancellation_reason" => {
            "a short note, for example Reviewed (at most 500 characters)"
        }
        "color" => "color=#6b7280",
        "billing_day" => "billing_day=15",
        "shared_count" => "shared_count=1",
        "paid_at" => "paid_at=2026-01-01T12:00:00Z",
        "due_date" | "due_from" | "due_to" | "next_payment_date" | "trial_end_date" => {
            "a YYYY-MM-DD date, for example 2026-01-01"
        }
        "notification_time" => "notification_time=09:00",
        "notification_days_before" => "notification_days_before=[1,3,7]",
        "notification_advance_days" => "notification_advance_days=1",
        "monthly_budget" => "monthly_budget=100",
        "last_four" => "last_four=1234",
        "credit_limit" => "credit_limit=1000 (finite and nonnegative)",
        _ => "a valid exported backup, for example /tmp/kessai-backup.json",
    };
    format!("Use {example}.")
}
pub type Result<T, E = AppError> = std::result::Result<T, E>;
