//! MCP transport adapter over the shared Application contract.
use std::{path::Path, sync::Arc};

use kessai_core::KessaiCore;
use rmcp::{
    handler::server::{router::tool::ToolRouter, tool::ToolCallContext},
    model::*,
    service::RequestContext,
    tool, tool_router, ErrorData as McpError, RoleServer, ServerHandler, ServiceExt,
};
use schemars::JsonSchema;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};

use crate::app::*;

pub const INSTRUCTIONS: &str = "Kessai is a local, single-user subscription tracker. Tools read and write only the local Kessai database; nothing contacts banks or providers — \"cancel\" marks a local record cancelled. Workflow: `*_list` → take `id` → `*_get` / `*_update` / `*_delete`. If a name the user gives matches more than one record, ask which one instead of guessing. Lists return `items`, `total` and `next_cursor`; keep paging while `next_cursor` is non-null before claiming completeness. Amounts are decimal major units with a separate ISO-4217 `currency`; dates are YYYY-MM-DD; totals never convert currencies. Omitted fields stay unchanged; use `clear_fields` to blank one. Deletes and replace-mode imports: call with `dry_run=true`, show the user the preview, set `confirm=true` only after they approve. Repeating `payments_record` for the same due date is safe; repeating `*_create` is not.";
pub const REVIEW_PROMPT: &str = "Review the user's subscriptions. Steps: 1) `analytics_dashboard` and `settings_get` for currency context; 2) `subscriptions_list(upcoming_days=30)` and `subscriptions_list(review_overdue_days=90)`; 3) `price_history_list(since_days=365)`; 4) summarize spend per currency, flag unused/duplicate/price-raised items, propose concrete changes with ids; 5) make no changes until the user approves each one.";

#[derive(Debug, Clone, Copy, Default)]
pub struct McpOptions {
    /// Hide and reject every tool that is not annotated read-only.
    pub read_only: bool,
}

#[derive(Clone)]
pub struct KessaiMcp {
    app: Application,
    tool_router: ToolRouter<Self>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct EmptyParams {}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct IdParams {
    /// Opaque record id returned by the corresponding list tool.
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct DeleteParams {
    /// Opaque record id returned by the corresponding list tool.
    id: String,
    /// Preview the target and cascade without changing any records; default false.
    dry_run: Option<bool>,
    /// Apply deletion only after the user approves the preview; default false.
    confirm: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct SubscriptionUpdateParams {
    /// Opaque subscription id from subscriptions_list.
    id: String,
    #[serde(flatten)]
    input: UpdateSubscriptionInput,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct PaymentUpdateParams {
    /// Opaque ledger row id from payments_list.
    id: String,
    #[serde(flatten)]
    input: UpdatePaymentInput,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CardUpdateParams {
    /// Opaque card id from cards_list.
    id: String,
    #[serde(flatten)]
    input: UpdateCardInput,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
enum RecordedStatus {
    Paid,
    Skipped,
}
impl From<RecordedStatus> for PaymentStatus {
    fn from(value: RecordedStatus) -> Self {
        match value {
            RecordedStatus::Paid => Self::Paid,
            RecordedStatus::Skipped => Self::Skipped,
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct RecordParams {
    /// Opaque subscription id from subscriptions_list.
    subscription_id: String,
    /// Scheduled charge outcome: paid or skipped; pending requires payments_create.
    status: RecordedStatus,
    /// Due date, YYYY-MM-DD; defaults to the subscription's next_payment_date.
    due_date: Option<String>,
    /// Nonnegative decimal major units; defaults to the subscription's current amount.
    amount: Option<f64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CalendarParams {
    /// Calendar month, YYYY-MM, between 1900-01 and 9998-12.
    month: YearMonth,
    /// Page size, 1–500; default 200. Totals cover the full month before pagination.
    limit: Option<usize>,
    /// Opaque next_cursor from the same month; omit for the first page.
    cursor: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ReferenceListParams {
    /// Page size, 1–200; default 100.
    limit: Option<usize>,
    /// Opaque next_cursor from this same collection; omit for the first page.
    cursor: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CategoryCreateParams {
    /// Nonempty category display name; at most 100 characters.
    name: String,
    /// Category display color, #RRGGBB.
    color: String,
    /// Icon name shown in the Kessai UI.
    icon: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CategoryUpdateParams {
    /// Opaque category id from categories_list.
    id: String,
    /// Replacement nonempty display name; at most 100 characters.
    name: Option<String>,
    /// Replacement display color, #RRGGBB.
    color: Option<String>,
    /// Replacement icon name shown in the UI.
    icon: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct TagCreateParams {
    /// Nonempty tag display name; at most 100 characters.
    name: String,
    /// Optional display color, #RRGGBB; omitted uses the application default.
    color: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct TagUpdateParams {
    /// Opaque tag id from tags_list.
    id: String,
    /// Replacement nonempty display name; at most 100 characters.
    name: Option<String>,
    /// Replacement display color, #RRGGBB.
    color: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct SpendingParams {
    /// Number of trailing ledger months, 1–60; default 12. No currency conversion.
    months: Option<i32>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct YearParams {
    /// Calendar year, 1900–9998; paid amounts are summed without currency conversion.
    year: i32,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct PriceHistoryParams {
    /// Opaque subscription id from subscriptions_list; omitted includes all subscriptions.
    subscription_id: Option<String>,
    /// Only changes in the past 1–3650 days; omitted includes all history.
    since_days: Option<i64>,
    /// Page size, 1–200; default 50; sorted by changed_at descending, then id.
    limit: Option<usize>,
    /// Opaque next_cursor from the same filters; omit for the first page.
    cursor: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ExportParams {
    /// Backup destination on this machine; absolute or relative to server working directory.
    path: String,
    /// Allow replacing an existing backup file; default false.
    overwrite: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct ImportParams {
    /// Existing backup file on this machine; absolute or server-working-directory relative.
    path: String,
    /// Merge upserts by id; replace first removes existing data. Defaults to merge.
    #[serde(default)]
    mode: ImportMode,
    /// Validate and preview record/collision counts without changing domain data; default false.
    dry_run: Option<bool>,
    /// Apply only after the user approves; required for replace or overwriting merge collisions.
    confirm: Option<bool>,
}

/// Add adapter discovery constraints to the existing documented, typed Application inputs.
/// Runtime validation remains in Application, shared with the CLI.
fn input<T: JsonSchema + 'static>(default_limit: usize, maximum_limit: usize) -> Arc<JsonObject> {
    let mut schema = schemars::schema_for!(T).to_value();
    schema
        .as_object_mut()
        .expect("object input schema")
        .remove("title");
    schema["additionalProperties"] = json!(false);
    if schema.get("properties").is_none() {
        schema["properties"] = json!({});
    }
    for (name, property) in schema["properties"]
        .as_object_mut()
        .expect("input properties")
    {
        let constraints = match name.as_str() {
            "name" => json!({"minLength":1,"maxLength":100}),
            "notes" | "cancellation_reason" => json!({"maxLength":500}),
            "amount" | "monthly_budget" | "credit_limit" => json!({"minimum":0}),
            "currency" => json!({"pattern":"^[A-Z]{3}$"}),
            "color" => json!({"pattern":"^#[0-9a-fA-F]{6}$"}),
            "last_four" => json!({"pattern":"^[0-9]{4}$"}),
            "due_date" | "due_from" | "due_to" | "next_payment_date" | "trial_end_date" => {
                json!({"format":"date","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"})
            }
            "paid_at" => json!({"format":"date-time"}),
            "month" => json!({"pattern":"^[0-9]{4}-[0-9]{2}$"}),
            "billing_day" => json!({"minimum":1,"maximum":31}),
            "shared_count" => json!({"minimum":1}),
            "upcoming_days" | "trial_ending_within_days" => json!({"minimum":0,"maximum":366}),
            "review_overdue_days" | "since_days" => json!({"minimum":1,"maximum":3650}),
            "limit" => json!({"minimum":1,"maximum":maximum_limit,"default":default_limit}),
            "months" => json!({"minimum":1,"maximum":60,"default":12}),
            "year" => json!({"minimum":1900,"maximum":9998}),
            "notification_advance_days" => json!({"minimum":0,"maximum":365}),
            "notification_days_before" => {
                json!({"items":{"type":"integer","minimum":0,"maximum":365}})
            }
            "notification_time" => json!({"pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$"}),
            "dry_run" | "confirm" | "overwrite" => json!({"default":false}),
            _ => json!({}),
        };
        property
            .as_object_mut()
            .expect("property schema")
            .extend(constraints.as_object().unwrap().clone());
    }
    if T::schema_name() == CreateSubscriptionInput::schema_name() {
        schema["properties"]["status"]["default"] = json!("active");
        schema["properties"]["shared_count"]["default"] = json!(1);
        schema["properties"]["is_pinned"]["default"] = json!(false);
    }
    if T::schema_name() == CreateCardInput::schema_name() {
        schema["properties"]["color"]["default"] = json!("#6b7280");
    }
    Arc::new(schema.as_object().expect("object input schema").clone())
}

fn out<T: JsonSchema + 'static>() -> Arc<JsonObject> {
    if let Ok(schema) = rmcp::handler::server::tool::schema_for_output::<T>() {
        return schema;
    }
    // Untagged preview/outcome enums are object unions. rmcp's helper rejects
    // a root without type=object, so declare that invariant explicitly.
    let mut schema = schemars::schema_for!(T).to_value();
    let object = schema.as_object_mut().expect("object output schema");
    object.remove("title");
    object.remove("description");
    object.insert("type".into(), json!("object"));
    if let Some(variants) = object.remove("anyOf") {
        object.insert("oneOf".into(), variants);
    }
    Arc::new(object.clone())
}

fn error_result(error: AppError) -> CallToolResult {
    CallToolResult::error(vec![Content::text(error.json().to_string())])
}

fn tool_result<T: Serialize>(result: crate::app::Result<T>) -> CallToolResult {
    match result.and_then(|value| {
        serde_json::to_value(value).map_err(|e| AppError::Internal(e.to_string()))
    }) {
        Ok(value) => CallToolResult::structured(value),
        Err(error) => error_result(error),
    }
}

impl KessaiMcp {
    pub fn new(core: KessaiCore) -> Self {
        Self::with_options(core, McpOptions::default())
    }

    pub fn with_options(core: KessaiCore, options: McpOptions) -> Self {
        let mut tool_router = Self::tool_router();
        if options.read_only {
            for tool in tool_router.list_all() {
                if tool.annotations.as_ref().and_then(|a| a.read_only_hint) != Some(true) {
                    tool_router.disable_route(tool.name);
                }
            }
        }
        Self {
            app: Application::new(core),
            tool_router,
        }
    }

    pub fn discovered_tools(&self) -> Vec<Tool> {
        self.tool_router.list_all()
    }

    async fn invoke<I, O, F>(
        &self,
        mut arguments: JsonObject,
        operation: F,
    ) -> Result<CallToolResult, McpError>
    where
        I: DeserializeOwned + Send + 'static,
        O: Serialize + Send + 'static,
        F: FnOnce(Application, I) -> crate::app::Result<O> + Send + 'static,
    {
        // Shared convention: JSON null is omission, not an instruction to clear.
        arguments.retain(|_, value| !value.is_null());
        let input = match serde_json::from_value::<I>(Value::Object(arguments)) {
            Ok(input) => input,
            Err(error) => {
                let message = error.to_string();
                let field = if message.starts_with("missing field `")
                    || message.starts_with("unknown field `")
                {
                    message.split('`').nth(1).unwrap_or("arguments")
                } else {
                    "arguments"
                };
                return Ok(error_result(AppError::validation(field, &message,
                    "Use the tool inputSchema for field names, required parameters and enum values; dates use YYYY-MM-DD (for example 2026-01-15).")));
            }
        };
        let result = self
            .app
            .run_blocking(move |app| operation(app, input))
            .await;
        Ok(tool_result(result.and_then(|result| result)))
    }

    /// In-process entry point with exactly the same parsing and read-only policy as tools/call.
    pub async fn call_tool_named(
        &self,
        name: &str,
        arguments: Value,
    ) -> Result<CallToolResult, McpError> {
        if !self.tool_router.has_route(name) {
            return Err(McpError::invalid_params("tool not found", None));
        }
        let Value::Object(arguments) = arguments else {
            return Ok(error_result(AppError::validation(
                "arguments",
                "tool arguments must be an object",
                "Use an object such as {} for a tool without parameters.",
            )));
        };
        match name {
            "subscriptions_list" => self.subscriptions_list(arguments).await,
            "subscriptions_get" => self.subscriptions_get(arguments).await,
            "subscriptions_create" => self.subscriptions_create(arguments).await,
            "subscriptions_update" => self.subscriptions_update(arguments).await,
            "subscriptions_delete" => self.subscriptions_delete(arguments).await,
            "payments_list" => self.payments_list(arguments).await,
            "payments_record" => self.payments_record(arguments).await,
            "payments_create" => self.payments_create(arguments).await,
            "payments_update" => self.payments_update(arguments).await,
            "payments_delete" => self.payments_delete(arguments).await,
            "calendar_month" => self.calendar_month(arguments).await,
            "categories_list" => self.categories_list(arguments).await,
            "categories_create" => self.categories_create(arguments).await,
            "categories_update" => self.categories_update(arguments).await,
            "categories_delete" => self.categories_delete(arguments).await,
            "tags_list" => self.tags_list(arguments).await,
            "tags_create" => self.tags_create(arguments).await,
            "tags_update" => self.tags_update(arguments).await,
            "tags_delete" => self.tags_delete(arguments).await,
            "cards_list" => self.cards_list(arguments).await,
            "cards_create" => self.cards_create(arguments).await,
            "cards_update" => self.cards_update(arguments).await,
            "cards_delete" => self.cards_delete(arguments).await,
            "settings_get" => self.settings_get(arguments).await,
            "settings_update" => self.settings_update(arguments).await,
            "analytics_dashboard" => self.analytics_dashboard(arguments).await,
            "analytics_spending" => self.analytics_spending(arguments).await,
            "analytics_year" => self.analytics_year(arguments).await,
            "price_history_list" => self.price_history_list(arguments).await,
            "backup_export" => self.backup_export(arguments).await,
            "backup_import" => self.backup_import(arguments).await,
            _ => Err(McpError::invalid_params("tool not found", None)),
        }
    }
}

#[tool_router]
impl KessaiMcp {
    #[tool(
        description = "Find subscriptions in the local Kessai database and get their `id`s for follow-up calls. Filters combine with AND. Returns compact rows (no notes/timestamps — use `subscriptions_get` for those), `total` matching rows and `next_cursor`; keep calling with `cursor` until it is null before stating a list is complete. Does not contact any provider.",
        input_schema = input::<SubscriptionFilter>(50, 200),
        output_schema = out::<Page<SubscriptionItem>>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn subscriptions_list(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<SubscriptionFilter, _, _>(arguments, |app, p| app.list_subscriptions(p))
            .await
    }

    #[tool(
        description = "Read one subscription in full, including notes, timestamps, tags, and the names of its category and card. Requires an `id` from `subscriptions_list`.",
        input_schema = input::<IdParams>(50, 200),
        output_schema = out::<SubscriptionDetail>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn subscriptions_get(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<IdParams, _, _>(arguments, |app, p| app.get_subscription(&p.id))
            .await
    }

    #[tool(
        description = "Add a subscription record. `amount` is in major units of `currency` (9.99 = nine and ninety-nine); `currency` defaults to the user's display currency from settings. Omit `next_payment_date` only if unknown — the record then never appears in upcoming/calendar views. Calling twice creates two records; check `subscriptions_list(query=…)` first if unsure.",
        input_schema = input::<CreateSubscriptionInput>(50, 200),
        output_schema = out::<SubscriptionDetail>(),
        annotations(read_only_hint = false, destructive_hint = false,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn subscriptions_create(
        &self,
        arguments: JsonObject,
    ) -> Result<CallToolResult, McpError> {
        self.invoke::<CreateSubscriptionInput, _, _>(arguments, |app, p| app.create_subscription(p))
            .await
    }

    #[tool(
        description = "Change fields of one subscription; omitted fields stay unchanged. Lifecycle is just fields: set `status` (e.g. `paused`, `active`, `cancelled`) — `cancelled` marks the local record only, Kessai never contacts the provider; add `cancellation_reason` with it. `mark_reviewed=true` stamps the review time. Use `clear_fields` to blank nullable fields; a field cannot be both set and cleared. Tags are edited with `add_tag_ids`/`remove_tag_ids` (idempotent). A valid amount or currency change is appended to price history.",
        input_schema = input::<SubscriptionUpdateParams>(50, 200),
        output_schema = out::<SubscriptionDetail>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn subscriptions_update(
        &self,
        arguments: JsonObject,
    ) -> Result<CallToolResult, McpError> {
        self.invoke::<SubscriptionUpdateParams, _, _>(arguments, |app, p| {
            app.update_subscription(&p.id, p.input)
        })
        .await
    }

    #[tool(
        description = "Permanently delete a subscription and, by cascade, its payment history, price history and tag links. Two-step: call with `dry_run=true` to get the exact cascade counts, show them to the user, then call with `confirm=true` only after explicit approval. Neither flag → `confirmation_required`. To stop tracking without losing history, use `subscriptions_update(status=\"cancelled\")` instead.",
        input_schema = input::<DeleteParams>(50, 200),
        output_schema = out::<DeleteResult>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn subscriptions_delete(
        &self,
        arguments: JsonObject,
    ) -> Result<CallToolResult, McpError> {
        self.invoke::<DeleteParams, _, _>(arguments, |app, p| {
            app.delete_subscription(
                &p.id,
                p.confirm.unwrap_or(false),
                p.dry_run.unwrap_or(false),
            )
        })
        .await
    }

    #[tool(
        description = "Read the payment ledger (recorded paid/skipped/pending rows). Rows carry `subscription_name` and `currency`. Use `calendar_month` for upcoming charges; this tool is history. Filter by subscription, month, status or due-date range.",
        input_schema = input::<PaymentFilter>(50, 200),
        output_schema = out::<Page<PaymentItem>>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn payments_list(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<PaymentFilter, _, _>(arguments, |app, p| app.list_payments(p))
            .await
    }

    #[tool(
        description = "Record that a scheduled charge was paid or skipped. Defaults make the common case one call: `due_date` defaults to the subscription's current `next_payment_date`, `amount` to its current price. Recording the current due date advances `next_payment_date` to the next unsettled period (`schedule_advanced=true`). Safe to repeat: the same subscription+due_date returns the existing row (`replayed=true`); a different status or amount for that date is a `conflict` — use `payments_update` to change it. Use `payments_create` only for backfilling arbitrary rows.",
        input_schema = input::<RecordParams>(50, 200),
        output_schema = out::<RecordOutcome>(),
        annotations(read_only_hint = false, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn payments_record(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<RecordParams, _, _>(arguments, |app, p| {
            app.record_outcome(&p.subscription_id, p.status.into(), p.due_date, p.amount)
        })
        .await
    }

    #[tool(
        description = "Insert a ledger row directly (backfill history, add a `pending` row, or a date that is not the current due date). Does not advance the schedule and is not idempotent — prefer `payments_record` for \"I paid X\".",
        input_schema = input::<CreatePaymentInput>(50, 200),
        output_schema = out::<PaymentItem>(),
        annotations(read_only_hint = false, destructive_hint = false,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn payments_create(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<CreatePaymentInput, _, _>(arguments, |app, p| app.create_payment(p))
            .await
    }

    #[tool(
        description = "Correct an existing payment's amount, status, paid time or notes. Does not move the subscription schedule.",
        input_schema = input::<PaymentUpdateParams>(50, 200),
        output_schema = out::<PaymentItem>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn payments_update(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<PaymentUpdateParams, _, _>(arguments, |app, p| {
            app.update_payment(&p.id, p.input)
        })
        .await
    }

    #[tool(
        description = "Delete one ledger row (does not rewind the subscription's next_payment_date). Same dry_run/confirm two-step as other deletes.",
        input_schema = input::<DeleteParams>(50, 200),
        output_schema = out::<DeleteResult>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn payments_delete(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<DeleteParams, _, _>(arguments, |app, p| {
            app.delete_payment(
                &p.id,
                p.confirm.unwrap_or(false),
                p.dry_run.unwrap_or(false),
            )
        })
        .await
    }

    #[tool(
        description = "Project all charges due in a calendar month — every renewal occurrence of active/billable subscriptions plus any recorded rows — with `totals_by_currency` already summed (projected vs paid/skipped/pending). This answers \"what is due / how much will I pay this month\" without the model adding numbers. Currencies are never converted.",
        input_schema = input::<CalendarParams>(200, 500),
        output_schema = out::<CalendarMonth>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn calendar_month(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<CalendarParams, _, _>(arguments, |app, p| {
            app.calendar_month(p.month, p.limit, p.cursor)
        })
        .await
    }

    #[tool(
        description = "List categories with `subscription_count`. Needed to pick a `category_id`.",
        input_schema = input::<ReferenceListParams>(100, 200),
        output_schema = out::<Page<RefItem>>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn categories_list(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<ReferenceListParams, _, _>(arguments, |app, p| {
            app.list_categories(p.limit, p.cursor)
        })
        .await
    }

    #[tool(
        description = "Create a category. `color` is `#rrggbb`; `icon` is an icon name shown in the UI.",
        input_schema = input::<CategoryCreateParams>(100, 200),
        output_schema = out::<RefItem>(),
        annotations(read_only_hint = false, destructive_hint = false,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn categories_create(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<CategoryCreateParams, _, _>(arguments, |app, p| {
            app.create_category(p.name, p.color, p.icon)
        })
        .await
    }

    #[tool(
        description = "Rename/recolor a category; omitted fields unchanged.",
        input_schema = input::<CategoryUpdateParams>(100, 200),
        output_schema = out::<RefItem>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn categories_update(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<CategoryUpdateParams, _, _>(arguments, |app, p| {
            app.update_category(&p.id, p.name, p.color, p.icon)
        })
        .await
    }

    #[tool(
        description = "Delete a non-default category; linked subscriptions keep existing but lose the category (cascade shows how many). Default categories return `conflict`. Two-step dry_run/confirm.",
        input_schema = input::<DeleteParams>(100, 200),
        output_schema = out::<DeleteResult>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn categories_delete(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<DeleteParams, _, _>(arguments, |app, p| {
            app.delete_category(
                &p.id,
                p.confirm.unwrap_or(false),
                p.dry_run.unwrap_or(false),
            )
        })
        .await
    }

    #[tool(
        description = "List tags with `subscription_count`.",
        input_schema = input::<ReferenceListParams>(100, 200),
        output_schema = out::<Page<RefItem>>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn tags_list(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<ReferenceListParams, _, _>(arguments, |app, p| {
            app.list_tags(p.limit, p.cursor)
        })
        .await
    }

    #[tool(
        description = "Create a tag. To attach it, use `subscriptions_update(add_tag_ids=[…])`.",
        input_schema = input::<TagCreateParams>(100, 200),
        output_schema = out::<RefItem>(),
        annotations(read_only_hint = false, destructive_hint = false,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn tags_create(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<TagCreateParams, _, _>(arguments, |app, p| app.create_tag(p.name, p.color))
            .await
    }

    #[tool(
        description = "Rename/recolor a tag.",
        input_schema = input::<TagUpdateParams>(100, 200),
        output_schema = out::<RefItem>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn tags_update(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<TagUpdateParams, _, _>(arguments, |app, p| {
            app.update_tag(&p.id, p.name, p.color)
        })
        .await
    }

    #[tool(
        description = "Delete a tag and its links (subscriptions untouched). Two-step.",
        input_schema = input::<DeleteParams>(100, 200),
        output_schema = out::<DeleteResult>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn tags_delete(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<DeleteParams, _, _>(arguments, |app, p| {
            app.delete_tag(
                &p.id,
                p.confirm.unwrap_or(false),
                p.dry_run.unwrap_or(false),
            )
        })
        .await
    }

    #[tool(
        description = "List payment cards (name, type, last four, credit limit, `subscription_count`).",
        input_schema = input::<ReferenceListParams>(100, 200),
        output_schema = out::<Page<RefItem>>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn cards_list(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<ReferenceListParams, _, _>(arguments, |app, p| {
            app.list_cards(p.limit, p.cursor)
        })
        .await
    }

    #[tool(
        description = "Add a card. Store only `last_four`; never full numbers.",
        input_schema = input::<CreateCardInput>(100, 200),
        output_schema = out::<RefItem>(),
        annotations(read_only_hint = false, destructive_hint = false,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn cards_create(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<CreateCardInput, _, _>(arguments, |app, p| app.create_card(p))
            .await
    }

    #[tool(
        description = "Change card fields; `clear_fields` blanks last_four/credit_limit.",
        input_schema = input::<CardUpdateParams>(100, 200),
        output_schema = out::<RefItem>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn cards_update(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<CardUpdateParams, _, _>(arguments, |app, p| app.update_card(&p.id, p.input))
            .await
    }

    #[tool(
        description = "Delete a card; subscriptions using it keep existing without a card. Two-step.",
        input_schema = input::<DeleteParams>(100, 200),
        output_schema = out::<DeleteResult>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn cards_delete(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<DeleteParams, _, _>(arguments, |app, p| {
            app.delete_card(
                &p.id,
                p.confirm.unwrap_or(false),
                p.dry_run.unwrap_or(false),
            )
        })
        .await
    }

    #[tool(
        description = "Read app settings: display `currency` (used by `analytics_dashboard`), theme, notification and budget preferences.",
        input_schema = input::<EmptyParams>(50, 200),
        output_schema = out::<Settings>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn settings_get(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<EmptyParams, _, _>(arguments, |app, _| app.settings_get())
            .await
    }

    #[tool(
        description = "Change settings; omitted fields unchanged; `clear_fields:[\"monthly_budget\"]` removes the budget. Changing `currency` changes which subscriptions the dashboard totals include — it does not convert amounts.",
        input_schema = input::<UpdateSettingsInput>(50, 200),
        output_schema = out::<Settings>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn settings_update(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<UpdateSettingsInput, _, _>(arguments, |app, p| app.settings_update(p))
            .await
    }

    #[tool(
        description = "Current-state summary: normalized monthly/yearly totals of the user's share of active billable subscriptions in the display currency only; `excluded_currencies` counts subscriptions left out because conversion is not performed; `category_spending` breakdown.",
        input_schema = input::<EmptyParams>(50, 200),
        output_schema = out::<DashboardStats>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn analytics_dashboard(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<EmptyParams, _, _>(arguments, |app, _| app.analytics_dashboard())
            .await
    }

    #[tool(
        description = "Ledger-based history over the last N months: `monthly` series, `by_category`, and `velocity` (month-over-month change, projected annual). Sums *paid* rows by due date across all currencies without conversion — say so if the user has mixed currencies (see `settings_get`).",
        input_schema = input::<SpendingParams>(50, 200),
        output_schema = out::<SpendingReport>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn analytics_spending(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<SpendingParams, _, _>(arguments, |app, p| {
            app.analytics_spending(p.months.unwrap_or(12))
        })
        .await
    }

    #[tool(
        description = "One calendar year of ledger totals: total spent, average month, highest month, category breakdown. Same no-conversion caveat.",
        input_schema = input::<YearParams>(50, 200),
        output_schema = out::<YearSummary>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn analytics_year(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<YearParams, _, _>(arguments, |app, p| app.analytics_year(p.year))
            .await
    }

    #[tool(
        description = "Recorded price/currency changes (appended automatically when a subscription's amount or currency changes). Rows include `subscription_name`. Filter by subscription or recency.",
        input_schema = input::<PriceHistoryParams>(50, 200),
        output_schema = out::<Page<PriceChangeItem>>(),
        annotations(read_only_hint = true, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn price_history_list(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<PriceHistoryParams, _, _>(arguments, |app, p| {
            app.price_history_list(p.subscription_id, p.since_days, p.limit, p.cursor)
        })
        .await
    }

    #[tool(
        description = "Write a full JSON backup (version 1.2.0) of the local database to `path` on this machine and return its size and record counts. Refuses to overwrite unless `overwrite=true`. Use this instead of reading all tables into the conversation.",
        input_schema = input::<ExportParams>(50, 200),
        output_schema = out::<ExportOutcome>(),
        annotations(read_only_hint = false, destructive_hint = false,
                    idempotent_hint = true, open_world_hint = false)
    )]
    async fn backup_export(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<ExportParams, _, _>(arguments, |app, p| {
            app.export_backup_to(Path::new(&p.path), p.overwrite.unwrap_or(false))
        })
        .await
    }

    #[tool(
        description = "Restore from a backup file. `mode=\"merge\"` (default) upserts by id and keeps everything else; `mode=\"replace\"` deletes all existing data first. Validation errors are reported before anything is written; the import itself is one transaction. Two-step: `dry_run=true` returns counts and id collisions; `confirm=true` is required for `replace` and for merges that overwrite existing ids.",
        input_schema = input::<ImportParams>(50, 200),
        output_schema = out::<ImportResult>(),
        annotations(read_only_hint = false, destructive_hint = true,
                    idempotent_hint = false, open_world_hint = false)
    )]
    async fn backup_import(&self, arguments: JsonObject) -> Result<CallToolResult, McpError> {
        self.invoke::<ImportParams, _, _>(arguments, |app, p| {
            app.import_backup_from(
                Path::new(&p.path),
                p.mode,
                p.confirm.unwrap_or(false),
                p.dry_run.unwrap_or(false),
            )
        })
        .await
    }
}

fn make_resource(uri: &str, name: &str, description: &str) -> Resource {
    let mut raw = RawResource::new(uri, name);
    raw.description = Some(description.into());
    raw.mime_type = Some("application/json".into());
    Annotated {
        raw,
        annotations: None,
    }
}

fn make_template(uri: &str, name: &str, description: &str) -> ResourceTemplate {
    Annotated {
        raw: RawResourceTemplate {
            uri_template: uri.into(),
            name: name.into(),
            title: None,
            description: Some(description.into()),
            mime_type: Some("application/json".into()),
            icons: None,
        },
        annotations: None,
    }
}

fn to_value<T: Serialize>(value: T) -> crate::app::Result<Value> {
    serde_json::to_value(value).map_err(|e| AppError::Internal(e.to_string()))
}

impl KessaiMcp {
    pub fn resources(&self) -> Vec<Resource> {
        vec![
            make_resource(
                "kessai://settings",
                "Settings",
                "Current display currency and preferences",
            ),
            make_resource(
                "kessai://dashboard",
                "Dashboard",
                "Current spend in display currency only",
            ),
            make_resource(
                "kessai://subscriptions",
                "Subscriptions",
                "First 200 compact subscriptions, total and continuation cursor",
            ),
            make_resource(
                "kessai://categories",
                "Categories",
                "Categories with subscription counts, total and continuation cursor",
            ),
        ]
    }

    pub fn resource_templates(&self) -> Vec<ResourceTemplate> {
        vec![
            make_template("kessai://subscriptions/{id}", "Subscription", "Full subscription details by opaque id"),
            make_template("kessai://calendar/{year}/{month}", "Calendar month", "Calendar charges and full-month per-currency totals; year 1900–9998 and month 1–12"),
        ]
    }

    pub async fn read_resource_uri(&self, uri: &str) -> Result<ReadResourceResult, McpError> {
        let uri = uri.to_owned();
        let result = self
            .app
            .run_blocking(move |app| {
                let value = match uri.as_str() {
                    "kessai://settings" => app.settings_get().and_then(to_value),
                    "kessai://dashboard" => app.analytics_dashboard().and_then(to_value),
                    "kessai://subscriptions" => app
                        .list_subscriptions(SubscriptionFilter {
                            limit: Some(200),
                            ..Default::default()
                        })
                        .and_then(to_value),
                    "kessai://categories" => {
                        app.list_categories(Some(200), None).and_then(to_value)
                    }
                    _ => {
                        if let Some(id) = uri
                            .strip_prefix("kessai://subscriptions/")
                            .filter(|id| !id.is_empty() && !id.contains('/'))
                        {
                            app.get_subscription(id).and_then(to_value)
                        } else if let Some(period) = uri.strip_prefix("kessai://calendar/") {
                            let mut parts = period.split('/');
                            let year = parts.next().and_then(|year| year.parse::<i32>().ok());
                            let month = parts.next().and_then(|month| month.parse::<u32>().ok());
                            match (year, month, parts.next()) {
                                (Some(year), Some(month), None) => YearMonth::new(year, month)
                                    .and_then(|month| app.calendar_month(month, Some(500), None))
                                    .and_then(to_value),
                                _ => Err(AppError::validation(
                                    "uri",
                                    "invalid calendar resource URI",
                                    "Use kessai://calendar/2026/10.",
                                )),
                            }
                        } else {
                            Err(AppError::new(
                                ErrorKind::NotFound,
                                format!("unknown resource: {uri}"),
                            ))
                        }
                    }
                }?;
                Ok(ReadResourceResult::new(vec![
                    ResourceContents::TextResourceContents {
                        uri,
                        mime_type: Some("application/json".into()),
                        text: value.to_string(),
                        meta: None,
                    },
                ]))
            })
            .await
            .and_then(|result| result);
        result.map_err(|error| McpError::resource_not_found(error.to_string(), Some(error.json())))
    }

    pub fn review_prompt(
        &self,
        name: &str,
        arguments: Option<JsonObject>,
    ) -> Result<GetPromptResult, McpError> {
        if name != "subscription_review" {
            return Err(McpError::invalid_params("prompt not found", None));
        }
        if arguments.is_some_and(|arguments| !arguments.is_empty()) {
            return Err(McpError::invalid_params(
                "subscription_review takes no arguments",
                None,
            ));
        }
        Ok(GetPromptResult::new(vec![PromptMessage::new_text(
            PromptMessageRole::User,
            REVIEW_PROMPT,
        )])
        .with_description("Review subscriptions without changing them until the user approves"))
    }
}

impl ServerHandler for KessaiMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .enable_prompts()
                .build(),
        )
        .with_protocol_version(ProtocolVersion::LATEST)
        .with_server_info(
            Implementation::new("kessai-mcp", env!("CARGO_PKG_VERSION"))
                .with_title("Kessai subscriptions")
                .with_description("Local subscription tracker: no bank or provider contact"),
        )
        .with_instructions(INSTRUCTIONS)
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        self.tool_router
            .call(ToolCallContext::new(self, request, context))
            .await
    }

    async fn list_tools(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult {
            tools: self.discovered_tools(),
            meta: None,
            next_cursor: None,
        })
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.tool_router.get(name).cloned()
    }

    async fn list_resources(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        Ok(ListResourcesResult {
            resources: self.resources(),
            meta: None,
            next_cursor: None,
        })
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        self.read_resource_uri(&request.uri).await
    }

    async fn list_resource_templates(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        Ok(ListResourceTemplatesResult {
            resource_templates: self.resource_templates(),
            meta: None,
            next_cursor: None,
        })
    }

    async fn list_prompts(
        &self,
        _: Option<PaginatedRequestParams>,
        _: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
        Ok(ListPromptsResult {
            prompts: vec![Prompt::new(
                "subscription_review",
                Some("Review spending and propose changes for user approval"),
                None,
            )],
            meta: None,
            next_cursor: None,
        })
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _: RequestContext<RoleServer>,
    ) -> Result<GetPromptResult, McpError> {
        self.review_prompt(&request.name, request.arguments)
    }
}

pub async fn serve_stdio(core: KessaiCore, options: McpOptions) -> crate::app::Result<()> {
    let service = KessaiMcp::with_options(core, options)
        .serve(rmcp::transport::stdio())
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    service
        .waiting()
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(())
}

pub async fn serve_http(
    core: KessaiCore,
    port: u16,
    token: String,
    read_only: bool,
) -> crate::app::Result<()> {
    crate::http::serve(core, port, token, read_only).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{BTreeSet, HashSet};

    fn fixture(read_only: bool) -> (tempfile::TempDir, KessaiMcp) {
        let dir = tempfile::tempdir().unwrap();
        let core = KessaiCore::new(&dir.path().join("mcp.db")).unwrap();
        (dir, KessaiMcp::with_options(core, McpOptions { read_only }))
    }

    fn text(result: &CallToolResult) -> &str {
        &result.content[0].as_text().expect("JSON text content").text
    }

    fn error(result: CallToolResult) -> Value {
        assert_eq!(result.is_error, Some(true));
        assert!(result.structured_content.is_none());
        let body: Value = serde_json::from_str(text(&result)).unwrap();
        assert!(body["error"]["code"].is_string());
        assert!(body["error"]["message"].is_string());
        assert!(body["error"]["side_effects"].is_string());
        body
    }

    fn required_keys(schema: &Value, value: &Value, root: &Value) -> bool {
        if let Some(reference) = schema["$ref"].as_str() {
            return required_keys(
                root.pointer(reference.trim_start_matches('#')).unwrap(),
                value,
                root,
            );
        }
        if let Some(variants) = schema
            .get("oneOf")
            .or_else(|| schema.get("anyOf"))
            .and_then(Value::as_array)
        {
            return variants
                .iter()
                .any(|variant| required_keys(variant, value, root));
        }
        if let Some(required) = schema["required"].as_array() {
            if !required
                .iter()
                .all(|key| value.get(key.as_str().unwrap()).is_some())
            {
                return false;
            }
        }
        if let Some(properties) = schema["properties"].as_object() {
            for (key, child) in properties {
                if let Some(value) = value.get(key).filter(|value| !value.is_null()) {
                    if !required_keys(child, value, root) {
                        return false;
                    }
                }
            }
        }
        if let Some(items) = value.as_array() {
            return items
                .iter()
                .all(|value| required_keys(&schema["items"], value, root));
        }
        true
    }

    async fn call(server: &KessaiMcp, name: &str, arguments: Value) -> Value {
        let result = server.call_tool_named(name, arguments).await.unwrap();
        assert_ne!(result.is_error, Some(true), "{name}: {}", text(&result));
        let value = result
            .structured_content
            .as_ref()
            .expect("structured success");
        assert_eq!(
            &serde_json::from_str::<Value>(text(&result)).unwrap(),
            value
        );
        let schema =
            serde_json::to_value(server.get_tool(name).unwrap().output_schema.unwrap()).unwrap();
        assert!(
            required_keys(&schema, value, &schema),
            "{name}: {value} does not contain schema-required keys"
        );
        value.clone()
    }

    fn update_artifact(path: &Path, actual: &str, variable: &str) {
        if std::env::var(variable).as_deref() == Ok("1") {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, actual).unwrap();
        }
        let expected = std::fs::read_to_string(path).unwrap_or_else(|error| {
            panic!("{}: {error}; regenerate with {variable}=1", path.display())
        });
        assert_eq!(
            expected,
            actual,
            "{} changed; regenerate with {variable}=1 after reviewing the contract",
            path.display()
        );
    }

    #[test]
    fn tool_catalog_snapshot_annotations_and_schemas() {
        let (_dir, server) = fixture(false);
        let tools = server.discovered_tools();
        assert_eq!(tools.len(), 31);
        for tool in &tools {
            let a = tool.annotations.as_ref().unwrap();
            assert!(a.read_only_hint.is_some(), "{}", tool.name);
            assert!(a.destructive_hint.is_some(), "{}", tool.name);
            assert!(a.idempotent_hint.is_some(), "{}", tool.name);
            assert_eq!(a.open_world_hint, Some(false), "{}", tool.name);
            if a.read_only_hint == Some(true) {
                assert_eq!(a.destructive_hint, Some(false));
            }
            assert!(tool.output_schema.is_some(), "{}", tool.name);
            assert_eq!(
                tool.input_schema["additionalProperties"], false,
                "{}",
                tool.name
            );
            for (name, property) in tool.input_schema["properties"].as_object().unwrap() {
                assert!(
                    property["description"]
                        .as_str()
                        .is_some_and(|description| !description.is_empty()),
                    "{}.{name}",
                    tool.name
                );
            }
        }
        let projected: Vec<_> = tools
            .iter()
            .map(|tool| {
                json!({
                    "name":tool.name, "description":tool.description,
                    "inputSchema":tool.input_schema, "outputSchema":tool.output_schema,
                    "annotations":tool.annotations,
                })
            })
            .collect();
        let actual = format!("{}\n", serde_json::to_string_pretty(&projected).unwrap());
        update_artifact(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/snapshots/tools_list.json"),
            &actual,
            "UPDATE_SNAPSHOTS",
        );
        let create = server.get_tool("subscriptions_create").unwrap();
        assert_eq!(create.input_schema["properties"]["name"]["maxLength"], 100);
        assert_eq!(create.input_schema["properties"]["notes"]["maxLength"], 500);
        assert_eq!(create.input_schema["properties"]["amount"]["minimum"], 0);
        assert_eq!(
            create.input_schema["properties"]["status"]["default"],
            "active"
        );
        assert_eq!(
            server.get_tool("subscriptions_list").unwrap().input_schema["properties"]["limit"]
                ["default"],
            50
        );
        assert_eq!(
            server.get_tool("categories_list").unwrap().input_schema["properties"]["limit"]
                ["default"],
            100
        );
        assert_eq!(
            server.get_tool("calendar_month").unwrap().input_schema["properties"]["limit"]
                ["maximum"],
            500
        );
    }

    #[test]
    fn generated_mcp_skill_reference_matches_live_tool_catalog() {
        let (_dir, server) = fixture(false);
        let mut actual = String::from("# Kessai MCP tools\n\nGenerated from the live MCP tool catalog. Do not edit by hand.\nRegenerate: `UPDATE_SKILL_REFS=1 cargo test -p kessai-mcp generated_mcp_skill_reference`.\n\nHints are **R**ead-only / **D**estructive / **I**dempotent / **O**pen-world (`+` true, `-` false).\nAll operations are local-only. IDs are opaque; obtain them from the corresponding list tool.\n\n");
        let mut rows = vec![[
            String::from("Tool"),
            String::from("Hints (R/D/I/O)"),
            String::from("Summary"),
            String::from("Required parameters"),
        ]];
        for tool in server.discovered_tools() {
            let a = tool.annotations.unwrap();
            let hints: String = [
                a.read_only_hint,
                a.destructive_hint,
                a.idempotent_hint,
                a.open_world_hint,
            ]
            .map(|value| if value == Some(true) { '+' } else { '-' })
            .into_iter()
            .collect();
            let description = tool.description.unwrap_or_default();
            let summary = description
                .split(". ")
                .next()
                .unwrap()
                .trim_end_matches('.')
                .replace('|', "\\|")
                .replace('\n', " ");
            let required = tool
                .input_schema
                .get("required")
                .and_then(Value::as_array)
                .map(|required| {
                    required
                        .iter()
                        .map(|name| format!("`{}`", name.as_str().unwrap()))
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .filter(|required| !required.is_empty())
                .unwrap_or_else(|| "—".into());
            rows.push([
                format!("`{}`", tool.name),
                format!("`{hints}`"),
                format!("{summary}."),
                required,
            ]);
        }
        let widths: [usize; 4] = std::array::from_fn(|column| {
            rows.iter()
                .map(|row| row[column].chars().count())
                .max()
                .unwrap()
        });
        for (index, row) in rows.into_iter().enumerate() {
            actual.push('|');
            for (cell, width) in row.into_iter().zip(widths) {
                actual.push_str(&format!(" {cell:<width$} |"));
            }
            actual.push('\n');
            if index == 0 {
                actual.push('|');
                for width in widths {
                    actual.push_str(&format!(" {} |", "-".repeat(width)));
                }
                actual.push('\n');
            }
        }
        assert!(actual.lines().count() <= 90);
        update_artifact(
            &Path::new(env!("CARGO_MANIFEST_DIR")).join("../../skills/kessai/references/mcp.md"),
            &actual,
            "UPDATE_SKILL_REFS",
        );
    }

    #[tokio::test]
    async fn read_only_catalog_and_call_policy_reject_every_mutation_and_alias() {
        let (_dir, server) = fixture(true);
        let tools = server.discovered_tools();
        assert_eq!(tools.len(), 12);
        assert!(tools
            .iter()
            .all(|tool| tool.annotations.as_ref().unwrap().read_only_hint == Some(true)));
        let (_dir, writable) = fixture(false);
        for tool in writable.discovered_tools() {
            if tool.annotations.unwrap().read_only_hint != Some(true) {
                assert!(server.get_tool(&tool.name).is_none());
                let error = server
                    .call_tool_named(&tool.name, json!({}))
                    .await
                    .unwrap_err();
                assert_eq!(error.message, "tool not found");
            }
        }
        for alias in [
            "toggle_subscription",
            "query_subscriptions",
            "add_subscription",
            "discover_all_tools",
            "mark_payment_paid",
        ] {
            assert!(writable.call_tool_named(alias, json!({})).await.is_err());
        }
    }

    #[tokio::test]
    async fn errors_are_errorbody_text_without_structured_content_and_dry_run_never_writes() {
        let (_dir, server) = fixture(false);
        let invalid = error(server.call_tool_named("subscriptions_create", json!({
            "name":"Bad date","amount":9.99,"billing_cycle":"monthly","next_payment_date":"next Friday"
        })).await.unwrap());
        assert_eq!(invalid["error"]["field"], "next_payment_date");
        assert_eq!(invalid["error"]["side_effects"], "none");
        for args in [json!({"id":"missing","typo":true}), json!({}), json!(false)] {
            let invalid = error(
                server
                    .call_tool_named("subscriptions_get", args)
                    .await
                    .unwrap(),
            );
            assert!(invalid["error"]["field"].is_string());
        }
        let row = call(
            &server,
            "subscriptions_create",
            json!({"name":"Keep history","amount":9.99,"billing_cycle":"monthly"}),
        )
        .await;
        let id = row["id"].as_str().unwrap();
        let unconfirmed = error(
            server
                .call_tool_named("subscriptions_delete", json!({"id":id}))
                .await
                .unwrap(),
        );
        assert_eq!(unconfirmed["error"]["code"], "confirmation_required");
        let before = call(&server, "subscriptions_list", json!({})).await;
        let preview = call(
            &server,
            "subscriptions_delete",
            json!({"id":id,"dry_run":true}),
        )
        .await;
        assert_eq!(preview["dry_run"], true);
        assert_eq!(preview["requires_confirmation"], true);
        let after = call(&server, "subscriptions_list", json!({})).await;
        assert_eq!(before, after);
        let deleted = call(
            &server,
            "subscriptions_delete",
            json!({"id":id,"confirm":true}),
        )
        .await;
        assert_eq!(deleted["deleted"], true);
    }

    #[tokio::test]
    async fn payments_record_defaults_replay_and_schedule_advancement() {
        let (_dir, server) = fixture(false);
        let row = call(&server, "subscriptions_create", json!({
            "name":"Music","amount":12.5,"currency":"EUR","billing_cycle":"monthly","next_payment_date":"2090-01-15"
        })).await;
        let id = row["id"].as_str().unwrap();
        let recorded = call(
            &server,
            "payments_record",
            json!({"subscription_id":id,"status":"paid"}),
        )
        .await;
        assert_eq!(recorded["payment"]["amount"], 12.5);
        assert_eq!(recorded["payment"]["due_date"], "2090-01-15");
        assert_eq!(recorded["replayed"], false);
        assert_eq!(recorded["schedule_advanced"], true);
        assert_eq!(recorded["subscription"]["next_payment_date"], "2090-02-15");
        let replay = call(
            &server,
            "payments_record",
            json!({"subscription_id":id,"status":"paid","due_date":"2090-01-15"}),
        )
        .await;
        assert_eq!(replay["payment"], recorded["payment"]);
        assert_eq!(replay["replayed"], true);
        assert_eq!(replay["schedule_advanced"], false);
        let conflict = error(
            server
                .call_tool_named(
                    "payments_record",
                    json!({
                        "subscription_id":id,"status":"skipped","due_date":"2090-01-15"
                    }),
                )
                .await
                .unwrap(),
        );
        assert_eq!(conflict["error"]["code"], "conflict");
        let pending = error(
            server
                .call_tool_named(
                    "payments_record",
                    json!({"subscription_id":id,"status":"pending"}),
                )
                .await
                .unwrap(),
        );
        assert_eq!(pending["error"]["code"], "validation_error");
    }

    #[tokio::test]
    async fn all_list_tools_traverse_120_unique_rows_with_matching_totals() {
        let (_dir, server) = fixture(false);
        let categories = call(&server, "categories_list", json!({"limit":200})).await["total"]
            .as_u64()
            .unwrap();
        for index in categories..120 {
            call(
                &server,
                "categories_create",
                json!({"name":format!("Category {index:03}"),"color":"#123456","icon":"folder"}),
            )
            .await;
        }
        for index in 0..120 {
            let subscription = call(&server, "subscriptions_create", json!({
                "name":format!("Subscription {index:03}"),"amount":10,"billing_cycle":"monthly","next_payment_date":"2090-01-15"
            })).await;
            let id = subscription["id"].as_str().unwrap();
            call(
                &server,
                "subscriptions_update",
                json!({"id":id,"amount":11}),
            )
            .await;
            call(
                &server,
                "payments_create",
                json!({"subscription_id":id,"amount":10,"due_date":"2090-01-15","status":"paid"}),
            )
            .await;
            call(
                &server,
                "tags_create",
                json!({"name":format!("Tag {index:03}")}),
            )
            .await;
            call(
                &server,
                "cards_create",
                json!({"name":format!("Card {index:03}"),"card_type":"debit"}),
            )
            .await;
        }
        for name in [
            "subscriptions_list",
            "payments_list",
            "categories_list",
            "tags_list",
            "cards_list",
            "price_history_list",
            "calendar_month",
        ] {
            let mut cursor = Value::Null;
            let mut ids = HashSet::new();
            let mut seen_cursors = HashSet::new();
            loop {
                let mut args = json!({"limit":37,"cursor":cursor});
                if name == "calendar_month" {
                    args["month"] = json!("2090-01");
                }
                let page = call(&server, name, args).await;
                assert_eq!(page["total"], 120, "{name}");
                for row in page["items"].as_array().unwrap() {
                    let key = if name == "calendar_month" {
                        "subscription_id"
                    } else {
                        "id"
                    };
                    assert!(
                        ids.insert(row[key].as_str().unwrap().to_owned()),
                        "duplicate {name} row"
                    );
                }
                cursor = page["next_cursor"].clone();
                if cursor.is_null() {
                    break;
                }
                assert!(seen_cursors.insert(cursor.as_str().unwrap().to_owned()));
            }
            assert_eq!(ids.len(), 120, "{name}");
        }
    }

    #[tokio::test]
    async fn every_tool_success_has_its_output_schema_required_keys() {
        let (dir, server) = fixture(false);
        let row = call(&server, "subscriptions_create", json!({"name":"Review me","amount":20,"billing_cycle":"monthly","next_payment_date":"2090-01-15"})).await;
        let id = row["id"].as_str().unwrap();
        call(&server, "subscriptions_get", json!({"id":id})).await;
        call(
            &server,
            "subscriptions_update",
            json!({"id":id,"amount":21,"notes":"Remember","status":"paused"}),
        )
        .await;
        let cleared = call(
            &server,
            "subscriptions_update",
            json!({"id":id,"clear_fields":["notes"],"status":"active"}),
        )
        .await;
        assert_eq!(cleared["notes"], Value::Null);
        call(&server, "subscriptions_list", json!({})).await;
        let payment = call(
            &server,
            "payments_create",
            json!({"subscription_id":id,"amount":19,"due_date":"2089-12-15","status":"pending"}),
        )
        .await;
        let payment_id = payment["id"].as_str().unwrap();
        call(
            &server,
            "payments_update",
            json!({"id":payment_id,"amount":18,"status":"paid"}),
        )
        .await;
        call(&server, "payments_list", json!({})).await;
        call(
            &server,
            "payments_record",
            json!({"subscription_id":id,"status":"skipped"}),
        )
        .await;
        call(&server, "calendar_month", json!({"month":"2090-01"})).await;
        call(
            &server,
            "payments_delete",
            json!({"id":payment_id,"dry_run":true}),
        )
        .await;
        call(
            &server,
            "payments_delete",
            json!({"id":payment_id,"confirm":true}),
        )
        .await;
        for kind in ["categories", "tags", "cards"] {
            let mut args = json!({"name":"Reference"});
            if kind == "categories" {
                args["color"] = json!("#123456");
                args["icon"] = json!("folder");
            }
            if kind == "cards" {
                args["card_type"] = json!("credit");
            }
            let row = call(&server, &format!("{kind}_create"), args).await;
            let ref_id = row["id"].as_str().unwrap();
            call(
                &server,
                &format!("{kind}_update"),
                json!({"id":ref_id,"name":"Renamed"}),
            )
            .await;
            call(&server, &format!("{kind}_list"), json!({})).await;
            call(
                &server,
                &format!("{kind}_delete"),
                json!({"id":ref_id,"dry_run":true}),
            )
            .await;
            call(
                &server,
                &format!("{kind}_delete"),
                json!({"id":ref_id,"confirm":true}),
            )
            .await;
        }
        call(&server, "settings_get", json!({})).await;
        call(
            &server,
            "settings_update",
            json!({"currency":"EUR","theme":"dark","monthly_budget":200}),
        )
        .await;
        call(&server, "analytics_dashboard", json!({})).await;
        call(&server, "analytics_spending", json!({})).await;
        call(&server, "analytics_year", json!({"year":2090})).await;
        call(&server, "price_history_list", json!({})).await;
        let path = dir.path().join("backup.json");
        call(&server, "backup_export", json!({"path":path})).await;
        call(
            &server,
            "backup_import",
            json!({"path":path,"dry_run":true}),
        )
        .await;
        call(
            &server,
            "backup_import",
            json!({"path":path,"confirm":true}),
        )
        .await;
        call(
            &server,
            "subscriptions_delete",
            json!({"id":id,"dry_run":true}),
        )
        .await;
        call(
            &server,
            "subscriptions_delete",
            json!({"id":id,"confirm":true}),
        )
        .await;
    }

    #[tokio::test]
    async fn resources_are_bounded_json_and_prompt_is_a_data_free_workflow() {
        let (_dir, server) = fixture(false);
        let info = server.get_info();
        assert_eq!(info.protocol_version, ProtocolVersion::LATEST);
        assert_eq!(
            info.server_info.title.as_deref(),
            Some("Kessai subscriptions")
        );
        assert_eq!(info.instructions.as_deref(), Some(INSTRUCTIONS));
        assert_eq!(
            serde_json::to_value(info.capabilities).unwrap(),
            json!({"tools":{},"resources":{},"prompts":{}})
        );
        let uris: BTreeSet<_> = server
            .resources()
            .into_iter()
            .map(|resource| {
                assert_eq!(resource.raw.mime_type.as_deref(), Some("application/json"));
                resource.raw.uri
            })
            .collect();
        assert_eq!(
            uris,
            BTreeSet::from([
                "kessai://settings".into(),
                "kessai://dashboard".into(),
                "kessai://subscriptions".into(),
                "kessai://categories".into()
            ])
        );
        let templates: BTreeSet<_> = server
            .resource_templates()
            .into_iter()
            .map(|template| template.raw.uri_template)
            .collect();
        assert_eq!(
            templates,
            BTreeSet::from([
                "kessai://subscriptions/{id}".into(),
                "kessai://calendar/{year}/{month}".into()
            ])
        );
        for uri in [
            "kessai://subscriptions/missing",
            "kessai://tags",
            "kessai://calendar/1899/1",
            "kessai://calendar/2026/1/extra",
        ] {
            assert_eq!(
                server.read_resource_uri(uri).await.unwrap_err().code,
                ErrorCode::RESOURCE_NOT_FOUND
            );
        }
        for index in 0..205 {
            call(&server, "subscriptions_create", json!({"name":format!("Private subscription {index}"),"amount":1,"billing_cycle":"monthly","next_payment_date":"2090-01-15"})).await;
        }
        let resources = server
            .read_resource_uri("kessai://subscriptions")
            .await
            .unwrap();
        let ResourceContents::TextResourceContents {
            mime_type, text, ..
        } = &resources.contents[0]
        else {
            panic!("expected JSON text");
        };
        assert_eq!(mime_type.as_deref(), Some("application/json"));
        let page: Value = serde_json::from_str(text).unwrap();
        assert_eq!(page["items"].as_array().unwrap().len(), 200);
        assert_eq!(page["total"], 205);
        assert!(page["next_cursor"].is_string());
        let id = page["items"][0]["id"].as_str().unwrap();
        assert!(server
            .read_resource_uri(&format!("kessai://subscriptions/{id}"))
            .await
            .is_ok());
        assert!(server
            .read_resource_uri("kessai://calendar/2090/1")
            .await
            .is_ok());
        let prompt =
            serde_json::to_value(server.review_prompt("subscription_review", None).unwrap())
                .unwrap();
        let message = prompt["messages"][0]["content"]["text"].as_str().unwrap();
        assert_eq!(message, REVIEW_PROMPT);
        assert!(!message.contains("Private subscription"));
        assert!(!message.contains("{\"id\""));
        assert!(server.review_prompt("subscription_summary", None).is_err());
        assert!(server
            .review_prompt(
                "subscription_review",
                Some(json!({"unexpected":"value"}).as_object().unwrap().clone())
            )
            .is_err());
    }
}
