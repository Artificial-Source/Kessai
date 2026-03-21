import { memo, useState } from 'react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_SHORT } from '@/lib/constants'
import { getTemplateLogo } from '@/data/subscription-templates'
import type { SubscriptionTemplate } from '@/data/subscription-templates'

interface TemplateCardProps {
  template: SubscriptionTemplate
  onClick: () => void
}

export const TemplateCard = memo(function TemplateCard({ template, onClick }: TemplateCardProps) {
  const [imgError, setImgError] = useState(false)
  const logoPath = getTemplateLogo(template.domain)

  return (
    <button
      onClick={onClick}
      className="hover-lift glass-card group flex items-center gap-3 p-3 text-left transition-all"
    >
      {logoPath && !imgError ? (
        <img
          src={logoPath}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-[family-name:var(--font-heading)] text-sm font-bold text-white"
          style={{ backgroundColor: template.color }}
        >
          {template.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">{template.name}</p>
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
          {template.category}
          {template.defaultAmount !== null && (
            <span className="text-muted-foreground/60">
              {' '}
              · {formatCurrency(template.defaultAmount, template.currency as CurrencyCode)}
              {BILLING_CYCLE_SHORT[template.defaultBillingCycle]}
            </span>
          )}
        </p>
      </div>
    </button>
  )
})
