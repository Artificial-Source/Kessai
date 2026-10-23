import { memo, useState } from 'react'
import { formatAmount, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_SHORT } from '@/lib/constants'
import { getTemplateLogo } from '@/data/subscription-templates'
import { Card } from '@/components/ui/card'
import { readableInkOn } from '@/lib/color'
import type { SubscriptionTemplate } from '@/data/subscription-templates'

interface TemplateCardProps {
  template: SubscriptionTemplate
  onClick: () => void
}

export const TemplateCard = memo(function TemplateCard({ template, onClick }: TemplateCardProps) {
  const [imgError, setImgError] = useState(false)
  const logoPath = getTemplateLogo(template.domain)

  return (
    <Card asChild interactive padding="none">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-w-0 items-center gap-3 rounded-lg p-3 pointer-coarse:min-h-14"
      >
        {logoPath && !imgError ? (
          <img
            src={logoPath}
            alt=""
            className="border-border-hover size-9 shrink-0 rounded-md border object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md font-[family-name:var(--font-heading)] text-sm font-bold"
            style={{ backgroundColor: template.color, color: readableInkOn(template.color) }}
          >
            {template.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-foreground truncate text-sm font-medium">{template.name}</span>
          <span className="type-label text-muted-foreground truncate">
            {template.category}
            {template.defaultAmount !== null &&
              ` · ${formatAmount(template.defaultAmount, template.currency as CurrencyCode)}${
                template.defaultAmount === 0
                  ? ''
                  : BILLING_CYCLE_SHORT[template.defaultBillingCycle]
              }`}
          </span>
        </span>
      </button>
    </Card>
  )
})
