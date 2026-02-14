# State Management

Subby uses Zustand stores with focused responsibilities.

## Stores

- `subscription-store.ts`: subscription CRUD and derived refresh behavior
- `category-store.ts`: default/custom category management
- `payment-store.ts`: payment history and payment status operations
- `settings-store.ts`: app preferences (theme, currency, notifications)
- `payment-card-store.ts`: payment card management
- `ui-store.ts`: transient UI state and view preferences

## Patterns

- Stores expose async actions for DB operations.
- Components select only required slices to avoid unnecessary rerenders.
- Schema validation is handled by Zod types in `src/types/`.

## Guidelines

- Keep expensive computations memoized in hooks/components.
- Avoid cross-store circular dependencies.
- Normalize DB booleans and JSON fields at boundaries.
