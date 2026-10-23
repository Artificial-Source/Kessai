//! Paid-ledger summaries retain full recorded charges. Subscription projections
//! are separate: `AnalyticsService::dashboard_summary` returns `DashboardStats`
//! using active, billable subscriptions and each user's amount / shared_count.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlySpend {
    pub month: String,
    pub total: f64,
    pub count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySpend {
    pub category_id: Option<String>,
    pub category_name: String,
    pub total: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YearSummary {
    pub year: i32,
    pub total_spent: f64,
    pub avg_monthly: f64,
    pub highest_month: String,
    pub highest_amount: f64,
    pub category_breakdown: Vec<CategorySpend>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpendingVelocity {
    pub current_month: f64,
    pub previous_month: f64,
    pub change_percent: f64,
    pub projected_annual: f64,
}
