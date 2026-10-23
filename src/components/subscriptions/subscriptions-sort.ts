export type SortOption =
  'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'date-asc' | 'date-desc' | 'category'

export const SORT_LABELS: Record<SortOption, string> = {
  'name-asc': 'Name (A-Z)',
  'name-desc': 'Name (Z-A)',
  'price-asc': 'Price (Low-High)',
  'price-desc': 'Price (High-Low)',
  'date-asc': 'Next billing (Soonest)',
  'date-desc': 'Next billing (Latest)',
  category: 'Category',
}
