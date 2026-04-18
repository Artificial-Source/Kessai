# Tutorial: First Run (Desktop)

This tutorial walks you through a complete first session in Kessai: launch the app, add one subscription, verify it on Dashboard and Calendar, and set up a backup.

> Scope: **desktop app flow** (`pnpm tauri dev` or a released desktop build).

## Before you start

- Install Kessai (see [How to install](../how-to/install.md)).
- Launch the app.

## 1) Open Settings and set your basics

1. Go to **Settings** in the left navigation.
2. In **Appearance**:
   - Set your **Theme** (`Dark`, `Light`, or `System`).
   - Set your **Display Currency**.
3. (Optional) Set a **Monthly Budget**.

Why this matters: Dashboard totals and subscription amounts are shown using your display currency.

## 2) Add your first subscription

1. Go to **Subscriptions**.
2. Click **Add Subscription**.
3. Fill at least these fields:
   - Name
   - Amount
   - Billing cycle
   - Next payment date
4. Save.

You should now see the subscription in your list/grid view.

## 3) Verify Dashboard reflects your data

1. Go to **Dashboard**.
2. Confirm your new subscription appears in summary stats (for example, active count and totals).
3. Check **Upcoming Payments** for the next 7 days.

## 4) Verify Calendar payment schedule

1. Go to **Calendar**.
2. Navigate to the month containing your next payment date.
3. Click the date to open the day panel.

You should see the scheduled payment for your subscription.

## 5) Export your first backup

1. Return to **Settings** → **Data & Backup**.
2. Click **Export Backup**.
3. Save the JSON file somewhere safe.

Kessai exports a versioned JSON backup (`export_data`), matching the app’s import/export pipeline.

## You’re done

You now have:

- A configured app
- One tracked subscription
- Visibility in Dashboard + Calendar
- A baseline backup file

## See also

- [Tutorial: Payment tracking and backups](./payment-tracking-and-backups.md)
- [How to configure Kessai](../how-to/configure.md)
- [How to troubleshoot](../how-to/troubleshoot.md)
