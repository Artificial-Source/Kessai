/**
 * Supported currency configurations with symbol, name, and locale.
 * Used for formatting amounts in the user's preferred currency.
 */
export const CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', locale: 'en-NZ' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH' },
  SEK: { symbol: 'kr', name: 'Swedish Krona', locale: 'sv-SE' },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', locale: 'nb-NO' },
  DKK: { symbol: 'kr', name: 'Danish Krone', locale: 'da-DK' },
  PLN: { symbol: 'zł', name: 'Polish Zloty', locale: 'pl-PL' },
  CZK: { symbol: 'Kč', name: 'Czech Koruna', locale: 'cs-CZ' },
  HUF: { symbol: 'Ft', name: 'Hungarian Forint', locale: 'hu-HU' },
  RON: { symbol: 'lei', name: 'Romanian Leu', locale: 'ro-RO' },
  BGN: { symbol: 'лв', name: 'Bulgarian Lev', locale: 'bg-BG' },
  TRY: { symbol: '₺', name: 'Turkish Lira', locale: 'tr-TR' },
  JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar', locale: 'zh-HK' },
  TWD: { symbol: 'NT$', name: 'Taiwan Dollar', locale: 'zh-TW' },
  KRW: { symbol: '₩', name: 'South Korean Won', locale: 'ko-KR' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  THB: { symbol: '฿', name: 'Thai Baht', locale: 'th-TH' },
  MYR: { symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY' },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah', locale: 'id-ID' },
  PHP: { symbol: '₱', name: 'Philippine Peso', locale: 'en-PH' },
  VND: { symbol: '₫', name: 'Vietnamese Dong', locale: 'vi-VN' },
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  ILS: { symbol: '₪', name: 'Israeli New Shekel', locale: 'he-IL' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
  SAR: { symbol: '﷼', name: 'Saudi Riyal', locale: 'ar-SA' },
  QAR: { symbol: 'ر.ق', name: 'Qatari Riyal', locale: 'ar-QA' },
  KWD: { symbol: 'د.ك', name: 'Kuwaiti Dinar', locale: 'ar-KW' },
  ZAR: { symbol: 'R', name: 'South African Rand', locale: 'en-ZA' },
  EGP: { symbol: 'E£', name: 'Egyptian Pound', locale: 'ar-EG' },
  NGN: { symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG' },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling', locale: 'en-KE' },
  MAD: { symbol: 'DH', name: 'Moroccan Dirham', locale: 'fr-MA' },
  MXN: { symbol: '$', name: 'Mexican Peso', locale: 'es-MX' },
  BRL: { symbol: 'R$', name: 'Brazilian Real', locale: 'pt-BR' },
  ARS: { symbol: '$', name: 'Argentine Peso', locale: 'es-AR' },
  CLP: { symbol: '$', name: 'Chilean Peso', locale: 'es-CL' },
  COP: { symbol: '$', name: 'Colombian Peso', locale: 'es-CO' },
  PEN: { symbol: 'S/', name: 'Peruvian Sol', locale: 'es-PE' },
  UYU: { symbol: '$U', name: 'Uruguayan Peso', locale: 'es-UY' },
  CRC: { symbol: '₡', name: 'Costa Rican Colon', locale: 'es-CR' },
  DOP: { symbol: 'RD$', name: 'Dominican Peso', locale: 'es-DO' },
} as const

/** Valid currency code string (e.g., 'USD', 'EUR', 'GBP') */
export type CurrencyCode = keyof typeof CURRENCIES

export type CurrencyOption = {
  value: CurrencyCode
  label: string
  symbol: string
  name: string
  searchText: string
}

function getCurrencyConfig(currency: string) {
  return (
    CURRENCIES[currency as CurrencyCode] ?? { symbol: currency, name: currency, locale: 'en-US' }
  )
}

/**
 * Formats a number using the currency's standard minor units and configured locale.
 * @param amount - The numeric amount to format
 * @param currency - Currency code (defaults to USD)
 * @returns Formatted currency string (e.g., "$15.99")
 * @example
 * formatCurrency(15.99, 'USD') // "$15.99"
 * formatCurrency(1234.5, 'EUR') // "1.234,50 €"
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const config = getCurrencyConfig(currency)
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/**
 * A subscription's own charge: "Free" for a zero amount (allowed for free tiers and
 * trials), otherwise the formatted currency. Totals keep using `formatCurrency`.
 */
export function formatAmount(amount: number, currency: string = 'USD'): string {
  return amount === 0 ? 'Free' : formatCurrency(amount, currency)
}

/**
 * Formats a number as compact currency for large values.
 * @param amount - The numeric amount to format
 * @param currency - Currency code (defaults to USD)
 * @returns Compact formatted currency string (e.g., "$1.2K")
 * @example
 * formatCompactCurrency(1500, 'USD') // "$1.5K"
 * formatCompactCurrency(1000000, 'EUR') // "1 Mio. €"
 */
export function formatCompactCurrency(amount: number, currency: string = 'USD'): string {
  const config = getCurrencyConfig(currency)
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(0)}`
  }
}

/**
 * Gets the symbol for a currency code.
 * @param currency - Currency code
 * @returns Currency symbol (e.g., "$", "€", "£")
 * @example
 * getCurrencySymbol('USD') // "$"
 * getCurrencySymbol('EUR') // "€"
 */
export function getCurrencySymbol(currency: string): string {
  return getCurrencyConfig(currency).symbol
}

/**
 * Gets currency options for select dropdowns.
 * @returns Array of currency options with value and label
 * @example
 * getCurrencyOptions() // [{ value: 'USD', label: '$ USD - US Dollar' }, ...]
 */
export function getCurrencyOptions(): CurrencyOption[] {
  return Object.entries(CURRENCIES).map(([code, config]) => ({
    value: code as CurrencyCode,
    label: `${config.symbol} ${code} - ${config.name}`,
    symbol: config.symbol,
    name: config.name,
    searchText: `${code} ${config.name} ${config.symbol}`.toLowerCase(),
  }))
}
