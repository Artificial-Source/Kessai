# How to configure Kessai

Use this guide to set core preferences in **Settings**.

## Open Settings

In the app sidebar, select **Settings**.

## Configure appearance and currency

In **Appearance**:

1. Set **Theme** (`Dark`, `Light`, `System`).
2. Set **Display Currency**.
3. (Optional) Set **Monthly Budget**.

These values drive totals shown in Dashboard, Subscriptions, and Analytics.

## Configure exchange-rate overrides

In **Custom Exchange Rates** (within **Appearance**):

1. Add or adjust rates for currencies you use.
2. Save changes.

This uses settings-backed `display_exchange_rates` values.

## Configure notifications (desktop behavior)

In **Notifications**:

1. Toggle notifications on/off.
2. Choose reminder lead times (`1, 3, 7, 14, 30` days).
3. Set notification time.
4. Use **Test** to send a test notification.

> Desktop-only note: this area is built around Tauri notification APIs.

## Configure motion preferences

In **Motion & Animations**, adjust animation and transition behavior to your preference.

## Configure categories, tags, and cards

In Settings:

- Use **Categories** to add/edit custom categories.
- Use **Tags** for tag organization.
- Use **Payment Cards** to manage card records used by subscriptions.

## Configure backup defaults

In **Data & Backup**:

- Run **Export Backup** to create a baseline JSON snapshot.
- Use **Import Data** when restoring or importing external data.

## See also

- [Tutorial: First run](../tutorials/first-run.md)
- [How to test](./test.md)
- [How to troubleshoot](./troubleshoot.md)
