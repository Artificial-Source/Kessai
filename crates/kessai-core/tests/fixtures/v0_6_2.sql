-- Persisted v0.6.2 schema (migrations 1..16), before recorded_outcome and
-- category-name triggers. The historically missing tag index exercises repair.
CREATE TABLE _kessai_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
WITH RECURSIVE versions(v) AS (VALUES(1) UNION ALL SELECT v+1 FROM versions WHERE v<16)
INSERT INTO _kessai_migrations(version,description) SELECT v,'historical fixture' FROM versions;
CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE payment_cards (id TEXT PRIMARY KEY, name TEXT NOT NULL, card_type TEXT NOT NULL DEFAULT 'debit', last_four TEXT, color TEXT NOT NULL DEFAULT '#6b7280', credit_limit REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE subscriptions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, amount REAL NOT NULL,
 currency TEXT NOT NULL DEFAULT 'USD', billing_cycle TEXT NOT NULL, billing_day INTEGER,
 category_id TEXT REFERENCES categories(id), color TEXT, logo_url TEXT, notes TEXT,
 is_active INTEGER NOT NULL DEFAULT 1, next_payment_date TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 card_id TEXT REFERENCES payment_cards(id), status TEXT NOT NULL DEFAULT 'active',
 trial_end_date TEXT, status_changed_at TEXT, shared_count INTEGER NOT NULL DEFAULT 1,
 is_pinned INTEGER NOT NULL DEFAULT 0, cancellation_reason TEXT, cancelled_at TEXT, last_reviewed_at TEXT
);
CREATE TABLE settings (
 id TEXT PRIMARY KEY DEFAULT 'singleton', theme TEXT NOT NULL DEFAULT 'dark', currency TEXT NOT NULL DEFAULT 'USD',
 notification_enabled INTEGER NOT NULL DEFAULT 1, notification_days_before TEXT NOT NULL DEFAULT '[1,3,7]',
 email TEXT, notification_email_enabled INTEGER NOT NULL DEFAULT 0, notification_desktop_enabled INTEGER NOT NULL DEFAULT 1,
 monthly_budget REAL, reduce_motion INTEGER NOT NULL DEFAULT 0, enable_transitions INTEGER NOT NULL DEFAULT 1,
 enable_hover_effects INTEGER NOT NULL DEFAULT 1, animation_speed TEXT NOT NULL DEFAULT 'normal',
 notification_advance_days INTEGER NOT NULL DEFAULT 1, notification_time TEXT NOT NULL DEFAULT '09:00',
 display_exchange_rates TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE payments (id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE, amount REAL NOT NULL, paid_at TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'paid', notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE price_history (id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE, old_amount REAL NOT NULL, new_amount REAL NOT NULL, old_currency TEXT NOT NULL DEFAULT 'USD', new_currency TEXT NOT NULL DEFAULT 'USD', changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#6b7280', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE subscription_tags (subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(subscription_id, tag_id));
CREATE INDEX idx_subscriptions_category ON subscriptions(category_id);
CREATE INDEX idx_subscriptions_next_payment ON subscriptions(next_payment_date);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_trial_end ON subscriptions(trial_end_date) WHERE trial_end_date IS NOT NULL;
CREATE INDEX idx_payments_subscription ON payments(subscription_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);
CREATE INDEX idx_payments_due_date ON payments(due_date);
CREATE INDEX idx_price_history_subscription ON price_history(subscription_id);
CREATE INDEX idx_price_history_changed_at ON price_history(changed_at);
CREATE INDEX idx_subscription_tags_sub ON subscription_tags(subscription_id);
INSERT INTO categories(id,name,color,icon,is_default) VALUES ('cat-streaming','My legacy streaming','#123456','box',1);
INSERT INTO settings(id,monthly_budget) VALUES ('singleton',250);
INSERT INTO subscriptions(id,name,amount,currency,billing_cycle,next_payment_date,category_id,notes,is_pinned)
VALUES ('legacy-sub','Legacy subscription',12,'USD','monthly','2026-02-15','cat-streaming','Preserve me',1);
INSERT INTO payments(id,subscription_id,amount,paid_at,due_date,status) VALUES
 ('legacy-a','legacy-sub',12,'2026-01-15T12:00:00Z','2026-01-15','paid'),
 ('legacy-b','legacy-sub',12,'2026-01-15T12:00:00Z','2026-01-15','paid');
INSERT INTO tags(id,name) VALUES ('legacy-tag','Legacy tag');
INSERT INTO subscription_tags VALUES ('legacy-sub','legacy-tag');
