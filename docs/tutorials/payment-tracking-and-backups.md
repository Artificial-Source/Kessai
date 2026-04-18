# Tutorial: Payment Tracking and Backups

This tutorial teaches a realistic monthly workflow:

1. Track upcoming renewals in Calendar
2. Record a payment as paid with **Pay** (or skip a renewal)
3. Export a backup
4. Restore from that backup

> Scope: payment tracking and backup/restore work in both desktop and web modes. Notification behavior is desktop-oriented.

## Before you start

- Have at least one subscription with a `next_payment_date`.
- If you are in browser mode, run the backend (see [How to run locally](../how-to/run-locally.md)).

## 1) Find upcoming payments

1. Open **Calendar**.
2. Go to the month you want to review.
3. Click a date with scheduled payments.

In the day panel you can inspect payment entries for that day.

## 2) Record payment outcomes

For each due payment in the day panel:

- Click **Pay** to record a completed payment.
- Or click the **Skip icon** when a renewal did not charge.

Kessai writes payment history through the `mark_payment_paid` / `skip_payment` flows.

## 3) Confirm updates in your overview

1. Open **Dashboard**.
2. Check updated totals and upcoming counts.
3. Open **Subscriptions** and confirm the subscription still has the expected next payment schedule.

## 4) Export a backup snapshot

1. Go to **Settings** → **Data & Backup**.
2. Click **Export Backup**.
3. Save the generated JSON file.

Export includes subscriptions, categories, payments, settings, plus tags, tag assignments, and price history when present.

## 5) Restore from backup (safe practice drill)

1. In **Settings** → **Data & Backup**, click **Import Data**.
2. Choose **Restore Backup**.
3. Select the JSON file from step 4.
4. Confirm import when prompted.

The restore path uses `import_data` with `clearExisting: true`, so current data is replaced by the backup content.

## 6) Verify restore success

After import:

- Open **Subscriptions** and confirm expected records exist.
- Open **Calendar** and verify payment entries are present.
- Open **Settings** to confirm DB-backed preferences (for example, display currency, monthly budget, categories, and tags).

## See also

- [Tutorial: First run](./first-run.md)
- [How to configure Kessai](../how-to/configure.md)
- [How to troubleshoot](../how-to/troubleshoot.md)
