use std::borrow::Cow;

use rmcp::{
    handler::server::router::tool::ToolRouter, handler::server::wrapper::Parameters, model::*,
    service::RequestContext, tool, tool_handler, tool_router, ErrorData as McpError, RoleServer,
    ServerHandler,
};
use serde::{Deserialize, Serialize};
use subby_core::models::{
    BillingCycle, NewCategory, NewSubscription, SubscriptionStatus, UpdateSubscription,
};
use subby_core::SubbyCore;

// ── Tool parameter types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct AddSubscriptionParams {
    #[schemars(description = "Name of the subscription")]
    name: String,
    #[schemars(description = "Billing amount")]
    amount: f64,
    #[schemars(description = "Billing cycle: weekly, monthly, quarterly, yearly, or custom")]
    billing_cycle: String,
    #[schemars(description = "Next payment date in YYYY-MM-DD format")]
    next_payment_date: String,
    #[schemars(description = "Currency code (e.g., USD, EUR)")]
    currency: Option<String>,
    #[schemars(description = "Day of month for billing (1-31)")]
    billing_day: Option<i32>,
    #[schemars(description = "Category ID")]
    category_id: Option<String>,
    #[schemars(description = "Payment card ID")]
    card_id: Option<String>,
    #[schemars(description = "Hex color (e.g., #ff0000)")]
    color: Option<String>,
    #[schemars(description = "Notes about the subscription")]
    notes: Option<String>,
    #[schemars(description = "Status: trial, active, paused, pending_cancellation, grace_period, cancelled")]
    status: Option<String>,
    #[schemars(description = "Trial end date in YYYY-MM-DD format")]
    trial_end_date: Option<String>,
    #[schemars(description = "Number of people sharing this subscription (default: 1)")]
    shared_count: Option<i32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateSubscriptionParams {
    #[schemars(description = "Subscription ID")]
    id: String,
    #[schemars(description = "New name")]
    name: Option<String>,
    #[schemars(description = "New amount")]
    amount: Option<f64>,
    #[schemars(description = "New billing cycle")]
    billing_cycle: Option<String>,
    #[schemars(description = "New currency")]
    currency: Option<String>,
    #[schemars(description = "New billing day")]
    billing_day: Option<i32>,
    #[schemars(description = "New category ID")]
    category_id: Option<String>,
    #[schemars(description = "New card ID")]
    card_id: Option<String>,
    #[schemars(description = "New color")]
    color: Option<String>,
    #[schemars(description = "New notes")]
    notes: Option<String>,
    #[schemars(description = "New next payment date")]
    next_payment_date: Option<String>,
    #[schemars(description = "New status")]
    status: Option<String>,
    #[schemars(description = "New trial end date")]
    trial_end_date: Option<String>,
    #[schemars(description = "New shared count")]
    shared_count: Option<i32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct IdParam {
    #[schemars(description = "The resource ID")]
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct PaymentParams {
    #[schemars(description = "Subscription ID")]
    subscription_id: String,
    #[schemars(description = "Due date in YYYY-MM-DD format")]
    due_date: String,
    #[schemars(description = "Payment amount")]
    amount: f64,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct AddCategoryParams {
    #[schemars(description = "Category name")]
    name: String,
    #[schemars(description = "Hex color (e.g., #ff0000)")]
    color: String,
    #[schemars(description = "Icon name (e.g., play-circle, code, music)")]
    icon: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpcomingParams {
    #[schemars(description = "Number of days to look ahead (default: 7)")]
    days: Option<i64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ImportDataParams {
    #[schemars(description = "JSON string of the backup data")]
    data: String,
    #[schemars(description = "Whether to clear existing data before import")]
    clear_existing: Option<bool>,
}

// ── MCP Server ─────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct SubbyMcp {
    core: SubbyCore,
    tool_router: ToolRouter<Self>,
}

fn mcp_err(msg: impl Into<String>) -> McpError {
    McpError {
        code: ErrorCode::INTERNAL_ERROR,
        message: Cow::from(msg.into()),
        data: None,
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

fn make_resource_template(uri_template: &str, name: &str, description: &str) -> ResourceTemplate {
    Annotated {
        raw: RawResourceTemplate {
            uri_template: uri_template.into(),
            name: name.into(),
            title: None,
            description: Some(description.into()),
            mime_type: Some("application/json".into()),
            icons: None,
        },
        annotations: None,
    }
}

#[tool_router]
impl SubbyMcp {
    pub fn new(core: SubbyCore) -> Self {
        Self {
            core,
            tool_router: Self::tool_router(),
        }
    }

    // ── Tools ──────────────────────────────────────────────────────────

    #[tool(description = "Add a new subscription to track")]
    async fn add_subscription(
        &self,
        Parameters(p): Parameters<AddSubscriptionParams>,
    ) -> Result<CallToolResult, McpError> {
        let cycle = BillingCycle::from_str(&p.billing_cycle)
            .ok_or_else(|| mcp_err(format!("Invalid billing cycle: {}", p.billing_cycle)))?;

        let status = p
            .status
            .as_deref()
            .and_then(SubscriptionStatus::from_str)
            .unwrap_or(SubscriptionStatus::Active);

        let sub = self
            .core
            .subscriptions()
            .create(NewSubscription {
                name: p.name,
                amount: p.amount,
                currency: p.currency.unwrap_or_else(|| "USD".to_string()),
                billing_cycle: cycle,
                billing_day: p.billing_day,
                category_id: p.category_id,
                card_id: p.card_id,
                color: p.color,
                logo_url: None,
                notes: p.notes,
                is_active: true,
                next_payment_date: Some(p.next_payment_date),
                status,
                trial_end_date: p.trial_end_date,
                shared_count: p.shared_count.unwrap_or(1),
                is_pinned: false,
            })
            .map_err(|e| mcp_err(e.to_string()))?;

        let json = serde_json::to_string_pretty(&sub).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Update an existing subscription")]
    async fn update_subscription(
        &self,
        Parameters(p): Parameters<UpdateSubscriptionParams>,
    ) -> Result<CallToolResult, McpError> {
        let update = UpdateSubscription {
            name: p.name,
            amount: p.amount,
            currency: p.currency,
            billing_cycle: p.billing_cycle.and_then(|s| BillingCycle::from_str(&s)),
            billing_day: p.billing_day.map(Some),
            category_id: p.category_id.map(Some),
            card_id: p.card_id.map(Some),
            color: p.color.map(Some),
            logo_url: None,
            notes: p.notes.map(Some),
            is_active: None,
            next_payment_date: p.next_payment_date.map(Some),
            status: p.status.and_then(|s| SubscriptionStatus::from_str(&s)),
            trial_end_date: p.trial_end_date.map(Some),
            shared_count: p.shared_count,
            is_pinned: None,
            cancellation_reason: None,
            cancelled_at: None,
            last_reviewed_at: None,
        };

        let sub = self
            .core
            .subscriptions()
            .update(&p.id, update)
            .map_err(|e| mcp_err(e.to_string()))?;
        let json = serde_json::to_string_pretty(&sub).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Remove a subscription")]
    async fn remove_subscription(
        &self,
        Parameters(p): Parameters<IdParam>,
    ) -> Result<CallToolResult, McpError> {
        self.core
            .subscriptions()
            .delete(&p.id)
            .map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(format!(
            "Subscription '{}' deleted",
            p.id
        ))]))
    }

    #[tool(description = "Pause or resume a subscription")]
    async fn toggle_subscription(
        &self,
        Parameters(p): Parameters<IdParam>,
    ) -> Result<CallToolResult, McpError> {
        let sub = self
            .core
            .subscriptions()
            .toggle_active(&p.id)
            .map_err(|e| mcp_err(e.to_string()))?;
        let status = if sub.is_active { "active" } else { "paused" };
        Ok(CallToolResult::success(vec![Content::text(format!(
            "{} is now {}",
            sub.name, status
        ))]))
    }

    #[tool(description = "Record a subscription payment as paid")]
    async fn mark_payment_paid(
        &self,
        Parameters(p): Parameters<PaymentParams>,
    ) -> Result<CallToolResult, McpError> {
        let payment = self
            .core
            .payments()
            .mark_as_paid(&p.subscription_id, &p.due_date, p.amount)
            .map_err(|e| mcp_err(e.to_string()))?;
        let json = serde_json::to_string_pretty(&payment).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Skip a subscription payment")]
    async fn skip_payment(
        &self,
        Parameters(p): Parameters<PaymentParams>,
    ) -> Result<CallToolResult, McpError> {
        let payment = self
            .core
            .payments()
            .skip_payment(&p.subscription_id, &p.due_date, p.amount)
            .map_err(|e| mcp_err(e.to_string()))?;
        let json = serde_json::to_string_pretty(&payment).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Create a new category")]
    async fn add_category(
        &self,
        Parameters(p): Parameters<AddCategoryParams>,
    ) -> Result<CallToolResult, McpError> {
        let cat = self
            .core
            .categories()
            .create(NewCategory {
                name: p.name,
                color: p.color,
                icon: p.icon,
            })
            .map_err(|e| mcp_err(e.to_string()))?;
        let json = serde_json::to_string_pretty(&cat).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Get upcoming subscription payments within N days")]
    async fn get_upcoming_payments(
        &self,
        Parameters(p): Parameters<UpcomingParams>,
    ) -> Result<CallToolResult, McpError> {
        let days = p.days.unwrap_or(7);
        let subs = self
            .core
            .subscriptions()
            .list()
            .map_err(|e| mcp_err(e.to_string()))?;
        let upcoming = subby_core::utils::get_upcoming_subscriptions(&subs, days);
        let json = serde_json::to_string_pretty(&upcoming).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Get spending breakdown by category")]
    async fn get_spending_by_category(&self) -> Result<CallToolResult, McpError> {
        let subs = self
            .core
            .subscriptions()
            .list()
            .map_err(|e| mcp_err(e.to_string()))?;
        let cats = self
            .core
            .categories()
            .list()
            .map_err(|e| mcp_err(e.to_string()))?;

        let active: Vec<_> = subs.iter().filter(|s| s.status.is_billable()).collect();

        let mut spending: std::collections::HashMap<String, (String, String, f64)> =
            std::collections::HashMap::new();

        for sub in &active {
            let monthly =
                subby_core::utils::calculate_monthly_amount(sub.amount, &sub.billing_cycle);
            let key = sub
                .category_id
                .clone()
                .unwrap_or_else(|| "uncategorized".to_string());
            let cat = sub
                .category_id
                .as_ref()
                .and_then(|cid| cats.iter().find(|c| &c.id == cid));
            let name = cat
                .map(|c| c.name.clone())
                .unwrap_or_else(|| "Uncategorized".to_string());
            let color = cat
                .map(|c| c.color.clone())
                .unwrap_or_else(|| "#6b7280".to_string());

            let entry = spending.entry(key).or_insert((name, color, 0.0));
            entry.2 += monthly;
        }

        let total: f64 = spending.values().map(|v| v.2).sum();

        #[derive(Serialize)]
        struct CategorySpend {
            name: String,
            color: String,
            monthly_amount: f64,
            percentage: f64,
        }

        let mut result: Vec<CategorySpend> = spending
            .into_values()
            .map(|(name, color, amount)| CategorySpend {
                name,
                color,
                monthly_amount: (amount * 100.0).round() / 100.0,
                percentage: if total > 0.0 {
                    (amount / total * 100.0 * 10.0).round() / 10.0
                } else {
                    0.0
                },
            })
            .collect();
        result.sort_by(|a, b| {
            b.monthly_amount
                .partial_cmp(&a.monthly_amount)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let json = serde_json::to_string_pretty(&result).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Export all Subby data as a JSON backup")]
    async fn export_data(&self) -> Result<CallToolResult, McpError> {
        let backup = self
            .core
            .data_management()
            .export_data()
            .map_err(|e| mcp_err(e.to_string()))?;
        let json = serde_json::to_string_pretty(&backup).map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(json)]))
    }

    #[tool(description = "Import data from a JSON backup string")]
    async fn import_data(
        &self,
        Parameters(p): Parameters<ImportDataParams>,
    ) -> Result<CallToolResult, McpError> {
        let backup: subby_core::models::BackupData = serde_json::from_str(&p.data)
            .map_err(|e| mcp_err(format!("Invalid backup JSON: {e}")))?;
        let result = self
            .core
            .data_management()
            .import_data(backup, p.clear_existing.unwrap_or(false))
            .map_err(|e| mcp_err(e.to_string()))?;
        Ok(CallToolResult::success(vec![Content::text(result.message)]))
    }
}

#[tool_handler]
impl ServerHandler for SubbyMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .enable_prompts()
                .build(),
            server_info: Implementation {
                name: "subby-mcp".into(),
                title: None,
                version: env!("CARGO_PKG_VERSION").into(),
                description: Some("MCP server for Subby subscription tracker".into()),
                icons: None,
                website_url: None,
            },
            instructions: Some(
                "Subby is a personal subscription tracker. Use tools to manage subscriptions, \
                 record payments, and analyze spending. Use resources to read current data."
                    .into(),
            ),
        }
    }

    // ── Resources ──────────────────────────────────────────────────────

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        Ok(ListResourcesResult {
            meta: None,
            next_cursor: None,
            resources: vec![
                make_resource(
                    "subby://subscriptions",
                    "All Subscriptions",
                    "List of all tracked subscriptions",
                ),
                make_resource(
                    "subby://categories",
                    "Categories",
                    "All subscription categories",
                ),
                make_resource("subby://settings", "Settings", "Current app settings"),
                make_resource("subby://cards", "Payment Cards", "All payment cards"),
                make_resource(
                    "subby://stats/dashboard",
                    "Dashboard Stats",
                    "Spending totals and category breakdown",
                ),
            ],
        })
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        let uri = &request.uri;

        let json = match uri.as_str() {
            "subby://subscriptions" => {
                let subs = self
                    .core
                    .subscriptions()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;
                serde_json::to_string_pretty(&subs).map_err(|e| mcp_err(e.to_string()))?
            }
            "subby://categories" => {
                let cats = self
                    .core
                    .categories()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;
                serde_json::to_string_pretty(&cats).map_err(|e| mcp_err(e.to_string()))?
            }
            "subby://settings" => {
                let settings = self
                    .core
                    .settings()
                    .get()
                    .map_err(|e| mcp_err(e.to_string()))?;
                serde_json::to_string_pretty(&settings).map_err(|e| mcp_err(e.to_string()))?
            }
            "subby://cards" => {
                let cards = self
                    .core
                    .payment_cards()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;
                serde_json::to_string_pretty(&cards).map_err(|e| mcp_err(e.to_string()))?
            }
            "subby://stats/dashboard" => {
                let subs = self
                    .core
                    .subscriptions()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;

                let active: Vec<_> = subs.iter().filter(|s| s.status.is_billable()).collect();
                let total_monthly: f64 = active
                    .iter()
                    .map(|s| {
                        subby_core::utils::calculate_monthly_amount(s.amount, &s.billing_cycle)
                    })
                    .sum();

                #[derive(Serialize)]
                struct Stats {
                    total_monthly: f64,
                    total_yearly: f64,
                    active_count: usize,
                    total_count: usize,
                    average_per_subscription: f64,
                }

                let stats = Stats {
                    total_monthly: (total_monthly * 100.0).round() / 100.0,
                    total_yearly: (total_monthly * 12.0 * 100.0).round() / 100.0,
                    active_count: active.len(),
                    total_count: subs.len(),
                    average_per_subscription: if active.is_empty() {
                        0.0
                    } else {
                        (total_monthly / active.len() as f64 * 100.0).round() / 100.0
                    },
                };

                serde_json::to_string_pretty(&stats).map_err(|e| mcp_err(e.to_string()))?
            }
            _ if uri.starts_with("subby://subscriptions/") => {
                let id = uri.strip_prefix("subby://subscriptions/").unwrap();
                let sub = self
                    .core
                    .subscriptions()
                    .get(id)
                    .map_err(|e| mcp_err(e.to_string()))?;
                serde_json::to_string_pretty(&sub).map_err(|e| mcp_err(e.to_string()))?
            }
            _ if uri.starts_with("subby://payments/") => {
                let parts: Vec<&str> = uri
                    .strip_prefix("subby://payments/")
                    .unwrap()
                    .split('/')
                    .collect();
                if parts.len() != 2 {
                    return Err(mcp_err("Expected format: subby://payments/{year}/{month}"));
                }
                let year: i32 = parts[0].parse().map_err(|_| mcp_err("Invalid year"))?;
                let month: u32 = parts[1].parse().map_err(|_| mcp_err("Invalid month"))?;
                if month == 0 || month > 12 {
                    return Err(mcp_err("Month must be 1-12"));
                }
                let payments = self
                    .core
                    .payments()
                    .list_with_details(year, month)
                    .map_err(|e| mcp_err(e.to_string()))?;
                serde_json::to_string_pretty(&payments).map_err(|e| mcp_err(e.to_string()))?
            }
            _ => return Err(mcp_err(format!("Unknown resource: {uri}"))),
        };

        Ok(ReadResourceResult {
            contents: vec![ResourceContents::text(json, uri.as_str())],
        })
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        Ok(ListResourceTemplatesResult {
            meta: None,
            next_cursor: None,
            resource_templates: vec![
                make_resource_template(
                    "subby://subscriptions/{id}",
                    "Subscription Details",
                    "Get a single subscription by ID",
                ),
                make_resource_template(
                    "subby://payments/{year}/{month}",
                    "Monthly Payments",
                    "Payments for a specific month",
                ),
            ],
        })
    }

    // ── Prompts ────────────────────────────────────────────────────────

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, McpError> {
        Ok(ListPromptsResult {
            meta: None,
            next_cursor: None,
            prompts: vec![
                Prompt::new(
                    "subscription_summary",
                    Some("Get a comprehensive summary of all subscriptions and spending"),
                    None,
                ),
                Prompt::new(
                    "spending_analysis",
                    Some("Analyze spending patterns across categories"),
                    None,
                ),
                Prompt::new(
                    "upcoming_payments",
                    Some("Get a breakdown of upcoming payments in the next 30 days"),
                    None,
                ),
            ],
        })
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResult, McpError> {
        match request.name.as_str() {
            "subscription_summary" => {
                let subs = self
                    .core
                    .subscriptions()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;
                let settings = self
                    .core
                    .settings()
                    .get()
                    .map_err(|e| mcp_err(e.to_string()))?;
                let cats = self
                    .core
                    .categories()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;

                let active: Vec<_> = subs.iter().filter(|s| s.status.is_billable()).collect();
                let total_monthly: f64 = active
                    .iter()
                    .map(|s| {
                        subby_core::utils::calculate_monthly_amount(s.amount, &s.billing_cycle)
                    })
                    .sum();

                let subs_json = serde_json::to_string_pretty(&subs).unwrap_or_default();
                let cats_json = serde_json::to_string_pretty(&cats).unwrap_or_default();

                Ok(GetPromptResult {
                    description: Some("Subscription summary".into()),
                    messages: vec![
                        PromptMessage::new_text(
                            PromptMessageRole::User,
                            format!(
                                "Here are my subscriptions (currency: {}):\n\n{}\n\nCategories:\n{}\n\n\
                                 I have {} active subscriptions totaling {:.2} {}/month ({:.2} {}/year).\n\n\
                                 Please provide a comprehensive summary including:\n\
                                 1. Overview of all subscriptions grouped by category\n\
                                 2. Most and least expensive subscriptions\n\
                                 3. Spending breakdown by billing cycle\n\
                                 4. Suggestions for potential savings",
                                settings.currency, subs_json, cats_json,
                                active.len(), total_monthly, settings.currency,
                                total_monthly * 12.0, settings.currency,
                            ),
                        ),
                    ],
                })
            }
            "spending_analysis" => {
                let subs = self
                    .core
                    .subscriptions()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;
                let cats = self
                    .core
                    .categories()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;
                let settings = self
                    .core
                    .settings()
                    .get()
                    .map_err(|e| mcp_err(e.to_string()))?;

                let subs_json = serde_json::to_string_pretty(&subs).unwrap_or_default();
                let cats_json = serde_json::to_string_pretty(&cats).unwrap_or_default();

                Ok(GetPromptResult {
                    description: Some("Spending analysis".into()),
                    messages: vec![PromptMessage::new_text(
                        PromptMessageRole::User,
                        format!(
                            "Analyze my subscription spending patterns.\n\n\
                                 Subscriptions (currency: {}):\n{}\n\nCategories:\n{}\n\n\
                                 Please analyze:\n\
                                 1. Which categories I spend the most on\n\
                                 2. Whether any subscriptions overlap in functionality\n\
                                 3. Trends or patterns in my subscription choices\n\
                                 4. Recommendations for optimizing spending",
                            settings.currency, subs_json, cats_json,
                        ),
                    )],
                })
            }
            "upcoming_payments" => {
                let subs = self
                    .core
                    .subscriptions()
                    .list()
                    .map_err(|e| mcp_err(e.to_string()))?;
                let settings = self
                    .core
                    .settings()
                    .get()
                    .map_err(|e| mcp_err(e.to_string()))?;
                let upcoming = subby_core::utils::get_upcoming_subscriptions(&subs, 30);

                let upcoming_json = serde_json::to_string_pretty(&upcoming).unwrap_or_default();

                Ok(GetPromptResult {
                    description: Some("Upcoming payments".into()),
                    messages: vec![
                        PromptMessage::new_text(
                            PromptMessageRole::User,
                            format!(
                                "Here are my upcoming subscription payments for the next 30 days (currency: {}):\n\n{}\n\n\
                                 Please provide:\n\
                                 1. A chronological schedule of upcoming payments\n\
                                 2. Total amount due in the next 30 days\n\
                                 3. Any payments that are due soon (within 3 days)\n\
                                 4. Weekly spending breakdown",
                                settings.currency, upcoming_json,
                            ),
                        ),
                    ],
                })
            }
            _ => Err(mcp_err(format!("Unknown prompt: {}", request.name))),
        }
    }
}
