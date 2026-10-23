import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewCategory } from '@/types/category'
import type { NewSubscription } from '@/types/subscription'

const { toastErrorMock, toastSuccessMock, toastWarningMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastWarningMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: toastWarningMock,
  },
}))

import { useCategoryStore } from '@/stores/category-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { ImportDialog } from '../import-dialog'

const addSubscriptionMock = vi.fn()
const addCategoryMock = vi.fn()
const fetchSubscriptionsMock = vi.fn(async () => {})
const fetchCategoriesMock = vi.fn(async () => {})

function renderDialog() {
  const onOpenChange = vi.fn()
  const onDataChanged = vi.fn()
  render(<ImportDialog open onOpenChange={onOpenChange} onDataChanged={onDataChanged} />)
  return { onOpenChange, onDataChanged }
}

function chooseFile(content: string, name: string) {
  fireEvent.change(screen.getByLabelText('Choose import file'), {
    target: { files: [new File([content], name)] },
  })
}

async function uploadCSV(content: string) {
  chooseFile(content, 'subscriptions.csv')
  await screen.findByRole('button', { name: 'Preview import' })
}

async function previewCSV(content: string) {
  await uploadCSV(content)
  fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
  await screen.findByRole('button', { name: /^Import \d+ subscriptions?$/ })
}

describe('ImportDialog', () => {
  beforeEach(() => {
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    toastWarningMock.mockReset()
    addSubscriptionMock
      .mockReset()
      .mockImplementation(async (data: NewSubscription) => ({ ...data, id: `id-${data.name}` }))
    addCategoryMock.mockReset()
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
    renderDialog()
    expect(fetchSubscriptionsMock).toHaveBeenCalledTimes(1)
    expect(fetchCategoriesMock).toHaveBeenCalledTimes(1)
  })

  it('reports every failed row without a success toast when all writes fail', async () => {
    addSubscriptionMock.mockRejectedValue(new Error('database is locked'))
    const { onOpenChange, onDataChanged } = renderDialog()
    await previewCSV('name,amount\nAlpha,10.00\nBeta,12.50\n')

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))

    const outcome = await screen.findByRole('alert')
    expect(outcome).toHaveTextContent('2 rows failed to import')
    // A first attempt is just the import; only retries are numbered.
    expect(outcome).not.toHaveTextContent('Attempt')
    expect(outcome).toHaveTextContent('Imported 0 of 2 · 2 failed')
    // The in-dialog summary is the report; no toast covers the retry footer.
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onDataChanged).not.toHaveBeenCalled()
    expect(screen.getAllByText('database is locked')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Select row 2: Alpha' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select row 3: Beta' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Retry 2 failed rows' })).toBeEnabled()

    const footerClose = screen
      .getAllByRole('button', { name: 'Close' })
      .filter((button) => !button.querySelector('svg'))[0]
    fireEvent.click(footerClose)

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByLabelText('Choose import file')).toBeInTheDocument()
    expect(screen.queryByText('database is locked')).not.toBeInTheDocument()
  })

  it('keeps only failed rows after a partial import and retries just those rows', async () => {
    let betaAttempts = 0
    addSubscriptionMock.mockImplementation(async (data: NewSubscription) => {
      if (data.name === 'Beta' && betaAttempts++ === 0) throw new Error('disk full')
      return { ...data, id: `id-${data.name}` }
    })
    const { onOpenChange, onDataChanged } = renderDialog()
    await previewCSV('name,amount\nAlpha,10\nBeta,12\nGamma,14\n')

    fireEvent.click(screen.getByRole('button', { name: 'Import 3 subscriptions' }))

    const outcome = await screen.findByRole('alert')
    expect(outcome).toHaveTextContent('Imported 2 of 3 · 1 failed')
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(onDataChanged).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('disk full')).toBeInTheDocument()
    const beta = screen.getByRole('checkbox', { name: 'Select row 3: Beta' })
    expect(beta).toBeChecked()
    fireEvent.click(beta)
    expect(screen.getByRole('button', { name: 'Retry 0 failed rows' })).toBeDisabled()
    fireEvent.click(beta)

    fireEvent.click(screen.getByRole('button', { name: 'Retry 1 failed row' }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Imported 1 subscription'))
    expect(addSubscriptionMock.mock.calls.map(([data]) => data.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Beta',
    ])
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('applies amount and date format overrides chosen during mapping', async () => {
    renderDialog()
    await uploadCSV('name,amount,start_date\nNetflix,1.299,03/04/2025\n')

    expect(screen.getByText(/^Detected 1,234\.56 \(decimal point\)/)).toBeInTheDocument()
    expect(screen.getByText('0 of 1')).toBeInTheDocument()
    expect(screen.getByText(/Ambiguous date "03\/04\/2025"/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview import' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Amount format'), {
      target: { value: 'decimal-comma' },
    })
    fireEvent.change(screen.getByLabelText('Date format'), { target: { value: 'day-first' } })

    expect(screen.getByText('1 of 1')).toBeInTheDocument()
    expect(screen.queryByText(/Ambiguous date/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 subscription' }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(addSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Netflix', amount: 1299, next_payment_date: '2025-04-03' })
    )
  })

  it('requires an explicit amount format when the column mixes decimal styles', async () => {
    renderDialog()
    await uploadCSV('name,amount\nNetflix,12.99\nSpotify,"9,99"\n')

    expect(screen.getByLabelText('Amount format')).toHaveAccessibleDescription(
      'This column mixes 1,234.56 and 1.234,56 styles. Choose the one your bank uses.'
    )
    expect(screen.getByRole('button', { name: 'Preview import' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Amount format'), { target: { value: 'decimal-dot' } })

    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview import' })).toBeEnabled()
  })

  it('offers the rename policy for names repeated inside the file', async () => {
    renderDialog()
    await previewCSV('name,amount\nNetflix,10\nNetflix,12\n')

    const duplicates = screen.getByRole('group', { name: '1 duplicate found' })
    expect(duplicates).toHaveAccessibleDescription(/1 repeated in this file\. They will be skipped/)
    // The button counts what will be written, not what is selected.
    expect(screen.getByRole('button', { name: 'Import 1 subscription' })).toBeEnabled()
    expect(within(duplicates).getByRole('button', { name: 'Skip duplicates' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByText('Repeated')).toBeInTheDocument()

    fireEvent.click(within(duplicates).getByRole('button', { name: 'Rename & import' }))
    expect(duplicates).toHaveAccessibleDescription(/suffix/)
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Imported 2 subscriptions'))
    expect(addSubscriptionMock.mock.calls.map(([data]) => data.name)).toEqual([
      'Netflix',
      'Netflix (imported)',
    ])
  })

  it('leaves missing categories out by default', async () => {
    renderDialog()
    await previewCSV('name,amount,category\nNetflix,10,Streaming\n')

    const policy = screen.getByRole('group', { name: '1 category not found' })
    expect(within(policy).getByRole('button', { name: 'Leave uncategorized' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 subscription' }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(addCategoryMock).not.toHaveBeenCalled()
    expect(addSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Netflix', category_id: null })
    )
  })

  it('creates missing categories through the category store when chosen', async () => {
    addCategoryMock.mockImplementation(async (data: NewCategory) => {
      useCategoryStore.setState((state) => ({
        categories: [
          ...state.categories,
          { ...data, id: 'cat-new', is_default: false, created_at: '2026-01-01T00:00:00.000Z' },
        ],
      }))
    })
    renderDialog()
    await previewCSV('name,amount,category\nNetflix,10,Streaming\nHulu,8,streaming\n')

    const policy = screen.getByRole('group', { name: '1 category not found' })
    fireEvent.click(within(policy).getByRole('button', { name: 'Create missing' }))
    expect(screen.getAllByText('New')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(addCategoryMock).toHaveBeenCalledTimes(1)
    expect(addCategoryMock).toHaveBeenCalledWith({
      name: 'Streaming',
      color: '#8b5cf6',
      icon: 'folder',
    })
    expect(addSubscriptionMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'Netflix', category_id: 'cat-new' })
    )
    expect(addSubscriptionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'Hulu', category_id: 'cat-new' })
    )
  })

  it('ignores a second import click while an attempt is in flight', async () => {
    let finishWrite!: (value: unknown) => void
    addSubscriptionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishWrite = resolve
        })
    )
    renderDialog()
    await previewCSV('name,amount\nNetflix,10\n')

    const importButton = screen.getByRole('button', { name: 'Import 1 subscription' })
    act(() => {
      importButton.click()
      importButton.click()
    })

    expect(addSubscriptionMock).toHaveBeenCalledTimes(1)
    expect(importButton).toBeDisabled()
    expect(importButton).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      finishWrite({ id: 'id-Netflix' })
    })

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1))
    expect(addSubscriptionMock).toHaveBeenCalledTimes(1)
  })

  it('previews validated JSON records and does not report success while unreadable rows remain', async () => {
    const { onOpenChange, onDataChanged } = renderDialog()
    const backup = {
      version: '1.2.0',
      subscriptions: [
        { name: 'Netflix', amount: 15.49, currency: 'USD', billing_cycle: 'monthly' },
        { name: '', amount: 'abc', billing_cycle: 'monthly' },
      ],
    }
    chooseFile(JSON.stringify(backup), 'backup.json')

    expect(await screen.findByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('1 row could not be read and will not be imported')).toBeInTheDocument()
    expect(screen.getByText(/^Row 2: /)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 subscription' }))

    // Nothing failed: a status in the success tone, not an alert.
    const title = await screen.findByText('Imported 1 of 1')
    const outcome = title.closest('[role="status"]')
    expect(outcome).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The unreadable row is reported once, by the warning below the notice, not twice.
    expect(outcome).not.toHaveTextContent(/could not be read/)
    expect(screen.getAllByText(/could not be read/)).toHaveLength(1)
    expect(screen.getByText('1 row could not be read and will not be imported')).toBeInTheDocument()
    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(onDataChanged).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('Nothing left to import')).toBeInTheDocument()
    expect(screen.queryByText(/failed rows?$/)).not.toBeInTheDocument()
    expect(screen.getByText(/^Row 2: /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument()
  })

  it('counts only rows it will write and reports skipped duplicates calmly', async () => {
    useSubscriptionStore.setState({
      subscriptions: [
        {
          id: 'netflix',
          name: 'Netflix',
          amount: 15.49,
          currency: 'USD',
          billing_cycle: 'monthly',
          billing_day: null,
          category_id: null,
          color: null,
          notes: null,
          is_active: true,
          next_payment_date: '2026-11-01',
          status: 'active',
          shared_count: 1,
          is_pinned: false,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    renderDialog()
    const backup = {
      version: '1.2.0',
      subscriptions: [
        { name: 'Netflix', amount: 15.49, currency: 'USD', billing_cycle: 'monthly' },
        { name: 'Hulu', amount: 7.99, currency: 'USD', billing_cycle: 'monthly' },
        { name: '', amount: 'abc', billing_cycle: 'monthly' },
      ],
    }
    chooseFile(JSON.stringify(backup), 'backup.json')

    // Two rows are selected, but "Skip duplicates" leaves Netflix out.
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 subscription' }))

    const title = await screen.findByText('Imported 1 of 2 · 1 skipped as a duplicate')
    expect(title.closest('[role="status"]')).not.toBeNull()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(addSubscriptionMock.mock.calls.map(([data]) => data.name)).toEqual(['Hulu'])
  })

  it('numbers only the retries in the outcome title', async () => {
    addSubscriptionMock.mockImplementation(async (data: NewSubscription) => {
      if (data.name === 'Beta') throw new Error('disk full')
      return { ...data, id: `id-${data.name}` }
    })
    renderDialog()
    await previewCSV('name,amount\nAlpha,10\nBeta,12\n')

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 subscriptions' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/^1 row failed to import/)

    fireEvent.click(screen.getByRole('button', { name: 'Retry 1 failed row' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/^Attempt 2: 1 row failed to import/)
    )
  })

  it('lists every reason when a JSON file has no readable subscriptions', async () => {
    renderDialog()
    chooseFile('null', 'backup.json')

    const problem = await screen.findByRole('alert')
    expect(problem).toHaveTextContent('No subscriptions could be read from this file')
    expect(problem).toHaveTextContent('Unknown JSON format')
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Choose import file')).toHaveAttribute('aria-invalid', 'true')
  })

  it('reads a file dropped on the upload panel', async () => {
    renderDialog()
    const panel = screen.getByLabelText('Choose import file').closest('label')
    if (!panel) throw new Error('The file input is not inside its drop panel')

    fireEvent.drop(panel, {
      dataTransfer: { files: [new File(['name,amount\nNetflix,10\n'], 'subscriptions.csv')] },
    })

    expect(await screen.findByRole('button', { name: 'Preview import' })).toBeEnabled()
    expect(screen.getByText('1 of 1')).toBeInTheDocument()
  })

  it('adopts the date order a column proves and imports with it', async () => {
    renderDialog()
    await uploadCSV('name,amount,start_date\nNetflix,10,15/01/2025\nSpotify,5,03/04/2025\n')

    expect(screen.getByLabelText('Date format')).toHaveValue('auto')
    expect(screen.getByLabelText('Date format')).toHaveAccessibleDescription(
      'Detected DD/MM/YYYY from dates like 15/01/2025.'
    )
    expect(screen.getByText('2 of 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Import 2 subscriptions' }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled())
    expect(addSubscriptionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Spotify', next_payment_date: '2025-04-03' })
    )
  })
})
