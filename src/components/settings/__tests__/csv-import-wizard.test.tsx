import { act } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryStore } from '@/stores/category-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import type { NewCategory } from '@/types/category'
import type { NewSubscription, Subscription } from '@/types/subscription'

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

import { CSVImportWizard } from '../csv-import-wizard'

const addSubscriptionMock = vi.fn<(data: NewSubscription) => Promise<Subscription>>()
const addCategoryMock = vi.fn<(category: NewCategory) => Promise<void>>()
const fetchSubscriptionsMock = vi.fn(async () => {})
const fetchCategoriesMock = vi.fn(async () => {})

const BANK_CSV = [
  'Date;Description;Amount',
  '2026-01-05;Netflix;12,99',
  '2026-02-05;Netflix;12,99',
  '2026-01-10;Spotify;9,99',
  '2026-02-10;Spotify;9,99',
].join('\n')

const AMBIGUOUS_DATE_CSV = [
  'Date;Description;Amount',
  '05/01/2026;Netflix;12,99',
  '05/02/2026;Netflix;12,99',
].join('\n')

const DAY_FIRST_CSV = [
  'Date;Description;Amount',
  '15/01/2026;Netflix;12,99',
  '05/02/2026;Netflix;12,99',
].join('\n')

const MIXED_DECIMAL_CSV = ['Description;Amount', 'Netflix;12,99', 'Netflix;12.99'].join('\n')

const CATEGORY_CSV = [
  'Date;Description;Amount;Category',
  '2026-01-05;Netflix;12,99;Streaming',
  '2026-02-05;Netflix;12,99;Streaming',
].join('\n')

function saved(data: NewSubscription): Subscription {
  return { ...data, id: `id-${data.name}` } as Subscription
}

// ES2020 is the application's supported library target (no Promise.withResolvers).
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function renderWizard() {
  const onOpenChange = vi.fn()
  const onDataChanged = vi.fn()
  render(<CSVImportWizard open onOpenChange={onOpenChange} onDataChanged={onDataChanged} />)
  return { onOpenChange, onDataChanged }
}

async function uploadCsv(content: string, name = 'statement.csv') {
  const file = new File([content], name, { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText('Upload CSV file'), { target: { files: [file] } })
  await screen.findByLabelText('Amount format')
}

async function reachReview(content = BANK_CSV) {
  await uploadCsv(content)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('group', { name: 'Existing names' })
}

function currentStep() {
  const steps = screen.getByRole('list', { name: 'Import steps' })
  return within(steps).getByRole('listitem', { current: 'step' })
}

/** The results list item for one subscription. */
function resultRow(name: string) {
  const list = screen.getByRole('list', { name: 'Results by subscription' })
  const row = within(list).getByText(name).closest('li')
  if (!row) throw new Error(`No result row for ${name}`)
  return row
}

function importedNames() {
  return addSubscriptionMock.mock.calls.map(([data]) => data.name)
}

describe('CSVImportWizard', () => {
  beforeEach(() => {
    addSubscriptionMock.mockReset()
    addSubscriptionMock.mockImplementation(async (data) => saved(data))
    addCategoryMock.mockReset()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    fetchSubscriptionsMock.mockClear()
    fetchCategoriesMock.mockClear()
    useSubscriptionStore.setState({
      subscriptions: [],
      add: addSubscriptionMock,
      fetch: fetchSubscriptionsMock,
    })
    useCategoryStore.setState({ categories: [], add: addCategoryMock, fetch: fetchCategoriesMock })
  })

  afterEach(() => {
    cleanup()
  })

  it('reloads saved subscriptions and categories when it opens', () => {
    renderWizard()
    expect(fetchSubscriptionsMock).toHaveBeenCalledTimes(1)
    expect(fetchCategoriesMock).toHaveBeenCalledTimes(1)
  })

  it('explains a rejected file next to the upload control', async () => {
    renderWizard()
    expect(currentStep()).toHaveTextContent('Upload')

    fireEvent.change(screen.getByLabelText('Upload CSV file'), {
      target: { files: [new File(['%PDF'], 'statement.pdf')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent("statement.pdf isn't a CSV file")
    const input = screen.getByLabelText('Upload CSV file')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/isn't a CSV file/)
    expect(currentStep()).toHaveTextContent('Upload')
  })

  it('shows the detected decimal comma and applies amount and date format overrides', async () => {
    renderWizard()
    await uploadCsv(AMBIGUOUS_DATE_CSV)
    expect(currentStep()).toHaveTextContent('Columns')

    const amountFormat = screen.getByLabelText('Amount format')
    expect(amountFormat).toHaveValue('auto')
    expect(amountFormat).toHaveAccessibleDescription(/Detected 1\.234,56 \(decimal comma\)/)
    expect(screen.getByLabelText('Date format')).toHaveAccessibleDescription(
      'Dates like 05/01/2026 read both ways. Choose the order your bank uses.'
    )

    // Ambiguous slash dates are row errors until an order is chosen, and Next stays on mapping.
    expect(screen.getByText(/^Row 2: Ambiguous date "05\/01\/2026"/)).toBeInTheDocument()
    expect(screen.getByText('2 rows could not be read')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('alert')).toHaveTextContent('No subscriptions detected')
    expect(screen.getByLabelText('Amount format')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Date format'), { target: { value: 'day-first' } })
    expect(screen.getByLabelText('Date format')).toHaveAccessibleDescription(
      'Reading 05/01/2026 as 5 January 2026.'
    )
    expect(screen.getByText('Found 1 subscription in 2 of 2 rows.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(amountFormat, { target: { value: 'decimal-dot' } })
    expect(amountFormat).toHaveAccessibleDescription(
      /reading as 1,234\.56 \(decimal point\) instead/
    )
    expect(screen.getByText(/^Row 2: Invalid amount "12,99"/)).toBeInTheDocument()

    fireEvent.change(amountFormat, { target: { value: 'decimal-comma' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('$12.99')).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('Review')
  })

  it('reads every date day first when the column proves that order', async () => {
    renderWizard()
    await uploadCsv(DAY_FIRST_CSV)

    const dateFormat = screen.getByLabelText('Date format')
    expect(dateFormat).toHaveValue('auto')
    expect(dateFormat).toHaveAccessibleDescription(
      'Detected DD/MM/YYYY from dates like 15/01/2026.'
    )
    expect(screen.getByText('Found 1 subscription in 2 of 2 rows.')).toBeInTheDocument()
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
  })

  it('requires an explicit amount format when the amount column mixes decimal styles', async () => {
    renderWizard()
    await uploadCsv(MIXED_DECIMAL_CSV)

    expect(screen.getByLabelText('Amount format')).toHaveAccessibleDescription(/mixes/)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an amount format')
  })

  it('reports a partial import row by row and retries only the failed rows', async () => {
    addSubscriptionMock.mockRejectedValueOnce(new Error('Disk full'))
    const { onDataChanged } = renderWizard()
    await reachReview()

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))

    expect(await screen.findByRole('heading', { name: 'Partly imported' })).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('Results')
    expect(screen.getByText('Imported 1 of 2 · 1 failed')).toBeInTheDocument()
    const netflix = resultRow('Netflix')
    expect(within(netflix).getByText('Failed')).toBeInTheDocument()
    expect(within(netflix).getByText('Rows 2, 3')).toBeInTheDocument()
    expect(within(netflix).getByText('Disk full')).toBeInTheDocument()
    expect(within(resultRow('Spotify')).getByText('Imported')).toBeInTheDocument()
    expect(onDataChanged).toHaveBeenCalledTimes(1)
    expect(toastSuccessMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry 1 failed row' }))

    expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    expect(importedNames()).toEqual(['Netflix', 'Spotify', 'Netflix'])
    expect(screen.getByText('Imported 2 of 2')).toBeInTheDocument()
    expect(within(resultRow('Netflix')).getByText('Imported')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('marks an import without successful writes as failed and keeps failed rows editable', async () => {
    addSubscriptionMock.mockRejectedValue(new Error('Offline'))
    const { onDataChanged } = renderWizard()
    await reachReview()

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))

    expect(await screen.findByRole('heading', { name: 'Import failed' })).toBeInTheDocument()
    expect(screen.getByText('Imported 0 of 2 · 2 failed')).toBeInTheDocument()
    const results = screen.getByRole('list', { name: 'Results by subscription' })
    expect(within(results).getAllByText('Offline')).toHaveLength(2)
    expect(onDataChanged).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()

    addSubscriptionMock.mockReset()
    addSubscriptionMock.mockImplementation(async (data) => saved(data))
    fireEvent.click(screen.getByRole('button', { name: 'Edit failed rows' }))

    expect(screen.getByText('Failed rows')).toBeInTheDocument()
    expect(screen.getAllByText(/Offline/)).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Back to results' })).toBeInTheDocument()

    const spotify = screen.getByRole('checkbox', { name: 'Select Spotify' })
    expect(spotify).toBeChecked()
    fireEvent.click(spotify)
    expect(spotify).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 subscription' }))

    expect(await screen.findByRole('heading', { name: 'Partly imported' })).toBeInTheDocument()
    expect(importedNames()).toEqual(['Netflix'])
    expect(screen.getByText('Imported 1 of 2 · 1 failed')).toBeInTheDocument()
    expect(within(resultRow('Spotify')).getByText('Failed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry 1 failed row' }))

    expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    expect(importedNames()).toEqual(['Netflix', 'Spotify'])
    expect(screen.getByText('Imported 2 of 2')).toBeInTheDocument()
  })

  it('ignores repeated import clicks and refuses to close while writes are in flight', async () => {
    const pending = deferred<Subscription>()
    addSubscriptionMock.mockImplementationOnce(() => pending.promise)
    const { onOpenChange } = renderWizard()
    await reachReview()

    const importButton = screen.getByRole('button', { name: 'Import 2 subscriptions' })
    fireEvent.click(importButton)
    fireEvent.click(importButton)
    expect(importButton).toBeDisabled()
    expect(importButton).toHaveAttribute('aria-busy', 'true')

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => {
      pending.resolve(saved({ name: 'Netflix' } as NewSubscription))
    })

    expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    expect(importedNames()).toEqual(['Netflix', 'Spotify'])
  })

  it('reports an all-skipped import truthfully', async () => {
    useSubscriptionStore.setState({
      subscriptions: [{ name: 'Netflix' }, { name: 'spotify' }] as Subscription[],
    })
    renderWizard()
    await reachReview()

    expect(screen.getByRole('button', { name: 'Skip duplicates' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(
      screen.getByText('2 selected subscriptions already exist and will be skipped.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))

    expect(
      await screen.findByRole('heading', { name: 'Nothing new to import' })
    ).toBeInTheDocument()
    expect(screen.getByText('Imported 0 of 2 · 2 skipped')).toBeInTheDocument()
    expect(within(resultRow('Netflix')).getByText('Skipped')).toBeInTheDocument()
    expect(addSubscriptionMock).not.toHaveBeenCalled()
  })

  it('renames existing names when that duplicate policy is chosen', async () => {
    useSubscriptionStore.setState({ subscriptions: [{ name: 'Netflix' }] as Subscription[] })
    renderWizard()
    await reachReview()

    const rename = screen.getByRole('button', { name: 'Rename & import' })
    fireEvent.click(rename)
    expect(rename).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Existing names' })).toHaveAccessibleDescription(
      '1 selected subscription already exists and will be imported with an "(imported)" suffix.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))

    expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    expect(importedNames()).toEqual(['Netflix (imported)', 'Spotify'])
    expect(
      within(resultRow('Netflix')).getByText('Saved as Netflix (imported)')
    ).toBeInTheDocument()
  })

  it('creates missing categories only after the create policy is chosen', async () => {
    addCategoryMock.mockImplementation(async (category) => {
      useCategoryStore.setState((state) => ({
        categories: [
          ...state.categories,
          { ...category, id: 'cat-streaming', is_default: false, created_at: '2026-01-01' },
        ],
      }))
    })
    const { onDataChanged } = renderWizard()
    await reachReview(CATEGORY_CSV)

    expect(screen.getByRole('button', { name: 'Leave uncategorized' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByText(/^Not found: Streaming\./)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create missing' }))
    expect(screen.getByText('Will create: Streaming.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 subscription' }))

    expect(await screen.findByRole('heading', { name: 'Import complete' })).toBeInTheDocument()
    expect(addCategoryMock).toHaveBeenCalledWith({
      name: 'Streaming',
      color: '#8b5cf6',
      icon: 'folder',
    })
    expect(addSubscriptionMock.mock.calls[0][0]).toMatchObject({
      name: 'Netflix',
      amount: 12.99,
      category_id: 'cat-streaming',
    })
    expect(onDataChanged).toHaveBeenCalledTimes(1)
  })
})
