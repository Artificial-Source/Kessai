import { EmbedBuilder, Colors } from 'discord.js'
import type { UpcomingPayment } from './reminder-service.js'
import type { Subscription, Category } from './backup-reader.js'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  MXN: 'MX$',
}

function formatCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency + ' '
  return `${symbol}${amount.toFixed(2)}`
}

export function buildUpcomingEmbed(
  payments: UpcomingPayment[],
  currency: string,
  _categories: Category[]
): EmbedBuilder {
  const total = payments.reduce((sum, p) => sum + p.subscription.amount, 0)

  const embed = new EmbedBuilder()
    .setTitle('📅 Upcoming Subscriptions')
    .setColor(Colors.Blue)
    .setTimestamp()

  if (payments.length === 0) {
    embed.setDescription('No upcoming payments in this period.')
    return embed
  }

  const lines = payments.map((p) => {
    const dueText =
      p.daysUntil === 0 ? '**Today**' : p.daysUntil === 1 ? 'Tomorrow' : `in ${p.daysUntil} days`

    return `• **${p.subscription.name}** - ${formatCurrency(p.subscription.amount, currency)} (${dueText})`
  })

  embed.setDescription(lines.join('\n'))
  embed.addFields({
    name: 'Total',
    value: formatCurrency(total, currency),
    inline: true,
  })

  return embed
}

export function buildReminderEmbed(
  payments: UpcomingPayment[],
  currency: string,
  _categories: Category[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🔔 Subscription Reminder')
    .setColor(Colors.Orange)
    .setTimestamp()

  if (payments.length === 0) {
    embed.setDescription('No payments due for your reminder days.')
    return embed
  }

  // Group by days until
  const grouped = new Map<number, UpcomingPayment[]>()
  for (const p of payments) {
    const existing = grouped.get(p.daysUntil) || []
    existing.push(p)
    grouped.set(p.daysUntil, existing)
  }

  const sections: string[] = []

  // Today's payments
  const today = grouped.get(0)
  if (today?.length) {
    const total = today.reduce((sum, p) => sum + p.subscription.amount, 0)
    sections.push(
      `**🔴 Due Today** (${formatCurrency(total, currency)}):\n` +
        today
          .map(
            (p) => `  • ${p.subscription.name} - ${formatCurrency(p.subscription.amount, currency)}`
          )
          .join('\n')
    )
  }

  // Tomorrow
  const tomorrow = grouped.get(1)
  if (tomorrow?.length) {
    const total = tomorrow.reduce((sum, p) => sum + p.subscription.amount, 0)
    sections.push(
      `**🟡 Due Tomorrow** (${formatCurrency(total, currency)}):\n` +
        tomorrow
          .map(
            (p) => `  • ${p.subscription.name} - ${formatCurrency(p.subscription.amount, currency)}`
          )
          .join('\n')
    )
  }

  // Other days
  for (const [days, list] of grouped) {
    if (days <= 1) continue
    const total = list.reduce((sum, p) => sum + p.subscription.amount, 0)
    sections.push(
      `**🟢 Due in ${days} days** (${formatCurrency(total, currency)}):\n` +
        list
          .map(
            (p) => `  • ${p.subscription.name} - ${formatCurrency(p.subscription.amount, currency)}`
          )
          .join('\n')
    )
  }

  embed.setDescription(sections.join('\n\n'))

  return embed
}

export function buildSummaryEmbed(
  total: number,
  currency: string,
  subscriptions: Subscription[],
  categories: Category[]
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📊 Monthly Subscription Summary')
    .setColor(Colors.Green)
    .setTimestamp()

  embed.addFields(
    {
      name: 'Monthly Cost',
      value: formatCurrency(total, currency),
      inline: true,
    },
    {
      name: 'Yearly Cost',
      value: formatCurrency(total * 12, currency),
      inline: true,
    },
    {
      name: 'Active Subscriptions',
      value: String(subscriptions.length),
      inline: true,
    }
  )

  // Group by category
  const byCategory = new Map<string, Subscription[]>()
  for (const sub of subscriptions) {
    const catId = sub.category_id || 'uncategorized'
    const existing = byCategory.get(catId) || []
    existing.push(sub)
    byCategory.set(catId, existing)
  }

  const categoryLines: string[] = []
  for (const [catId, subs] of byCategory) {
    const cat = categories.find((c) => c.id === catId)
    const catName = cat?.name || 'Other'
    const catTotal = subs.reduce((sum, s) => {
      switch (s.billing_cycle) {
        case 'weekly':
          return sum + s.amount * 4.33
        case 'monthly':
          return sum + s.amount
        case 'quarterly':
          return sum + s.amount / 3
        case 'yearly':
          return sum + s.amount / 12
        default:
          return sum + s.amount
      }
    }, 0)
    categoryLines.push(
      `• **${catName}**: ${formatCurrency(catTotal, currency)}/mo (${subs.length} subs)`
    )
  }

  if (categoryLines.length > 0) {
    embed.addFields({
      name: 'By Category',
      value: categoryLines.join('\n'),
      inline: false,
    })
  }

  return embed
}

export function buildErrorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('❌ Error')
    .setDescription(message)
    .setColor(Colors.Red)
    .setTimestamp()
}
