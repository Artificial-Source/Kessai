use super::{AppError, Page, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Datelike, NaiveDate};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Pagination policies shared by both adapters.
#[derive(Debug, Clone, Copy)]
pub enum ListKind {
    Standard,
    Reference,
    Calendar,
}
pub fn clamp_limit(limit: Option<usize>, kind: ListKind) -> Result<usize> {
    let (default, maximum) = match kind {
        ListKind::Standard => (50, 200),
        ListKind::Reference => (100, 200),
        ListKind::Calendar => (200, 500),
    };
    match limit {
        Some(0) => Err(AppError::validation(
            "limit",
            "limit must be greater than zero",
            "Use limit=50; maximum 200 (500 for calendar).",
        )),
        Some(limit) => Ok(limit.min(maximum)),
        None => Ok(default),
    }
}
/// Opaque offset token bound to the collection, filters and ordering, not page size.
#[derive(Debug, Clone)]
pub struct Cursor {
    offset: usize,
    filter_hash: u64,
}
impl Cursor {
    pub fn new(offset: usize, filters: &impl Serialize) -> Result<Self> {
        Ok(Self {
            offset,
            filter_hash: filter_hash(filters)?,
        })
    }
    pub fn encode(&self) -> String {
        URL_SAFE_NO_PAD.encode(format!("{}:{:016x}", self.offset, self.filter_hash))
    }
    pub fn decode(token: &str, filters: &impl Serialize) -> Result<Self> {
        let invalid = || {
            AppError::validation("cursor", "invalid cursor or cursor belongs to different filters", "Use next_cursor from the same list and filters, or omit cursor to start at the first page.")
        };
        if token.len() > 128 {
            return Err(invalid());
        }
        let bytes = URL_SAFE_NO_PAD.decode(token).map_err(|_| invalid())?;
        let text = std::str::from_utf8(&bytes).map_err(|_| invalid())?;
        let (offset, hash) = text.split_once(':').ok_or_else(invalid)?;
        let cursor = Self {
            offset: offset.parse().map_err(|_| invalid())?,
            filter_hash: u64::from_str_radix(hash, 16).map_err(|_| invalid())?,
        };
        if cursor.filter_hash != filter_hash(filters)? {
            return Err(invalid());
        }
        Ok(cursor)
    }
    pub fn offset(&self) -> usize {
        self.offset
    }
}
fn filter_hash(filters: &impl Serialize) -> Result<u64> {
    // Fixed FNV-1a rather than DefaultHasher, whose algorithm is not a contract.
    let bytes =
        serde_json::to_vec(filters).map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(bytes.into_iter().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
    }))
}
pub(super) fn page<T>(
    rows: Vec<T>,
    limit: usize,
    token: Option<&str>,
    filters: &impl Serialize,
) -> Result<Page<T>> {
    let total = rows.len();
    let offset = token
        .map(|token| Cursor::decode(token, filters).map(|cursor| cursor.offset()))
        .transpose()?
        .unwrap_or(0);
    let end = offset.saturating_add(limit).min(total);
    let next_cursor = if end < total {
        Some(Cursor::new(end, filters)?.encode())
    } else {
        None
    };
    Ok(Page {
        items: rows.into_iter().skip(offset).take(limit).collect(),
        total,
        next_cursor,
        warnings: Vec::new(),
    })
}

/// A validated calendar month. Deserialize and CLI parsing share the exact contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(try_from = "String", into = "String")]
#[schemars(with = "String")]
pub struct YearMonth {
    year: i32,
    month: u32,
}
impl YearMonth {
    pub fn new(year: i32, month: u32) -> Result<Self> {
        if !(1900..=9998).contains(&year) || !(1..=12).contains(&month) {
            return Err(AppError::validation(
                "month",
                "month must be between 1900-01 and 9998-12",
                "Use month=2026-01 in YYYY-MM format.",
            ));
        }
        Ok(Self { year, month })
    }
    pub fn year(&self) -> i32 {
        self.year
    }
    pub fn month(&self) -> u32 {
        self.month
    }
}
impl std::str::FromStr for YearMonth {
    type Err = AppError;
    fn from_str(value: &str) -> Result<Self> {
        let invalid =
            || AppError::validation("month", "month must be YYYY-MM", "Use month=2026-01.");
        if value.len() != 7
            || value.as_bytes()[4] != b'-'
            || !value
                .bytes()
                .enumerate()
                .all(|(index, byte)| index == 4 || byte.is_ascii_digit())
        {
            return Err(invalid());
        }
        let date =
            NaiveDate::parse_from_str(&format!("{value}-01"), "%Y-%m-%d").map_err(|_| invalid())?;
        Self::new(date.year(), date.month())
    }
}
impl TryFrom<String> for YearMonth {
    type Error = AppError;
    fn try_from(value: String) -> Result<Self> {
        value.parse()
    }
}
impl From<YearMonth> for String {
    fn from(value: YearMonth) -> Self {
        value.to_string()
    }
}
impl std::fmt::Display for YearMonth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:04}-{:02}", self.year, self.month)
    }
}
