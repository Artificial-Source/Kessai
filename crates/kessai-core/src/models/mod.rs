pub mod analytics;
pub mod category;
pub mod payment;
pub mod payment_card;
pub mod price_history;
pub mod settings;
pub mod stats;
pub mod subscription;
pub mod tag;

pub use analytics::*;
pub use category::*;
pub use payment::*;
pub use payment_card::*;
pub use price_history::*;
pub use settings::*;
pub use stats::*;
pub use subscription::*;
pub use tag::*;

/// Nullable patches distinguish omission (unchanged), null (clear), and a value (set).
/// Pair this helper with `default` and `skip_serializing_if = "Option::is_none"`.
pub(crate) fn deserialize_double_option<'de, T, D>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Ok(Some(serde::Deserialize::deserialize(deserializer)?))
}
