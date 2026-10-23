import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  restore: vi.fn(),
  exportData: vi.fn(),
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock('@/lib/data-management', () => ({
  readFileAsJson: mocks.read,
  validateBackupData: () => true,
  importData: mocks.restore,
  exportData: mocks.exportData,
  saveBackupToFile: mocks.save,
}))
vi.mock('../import-dialog', () => ({ ImportDialog: () => null }))
vi.mock('../csv-import-wizard', () => ({ CSVImportWizard: () => null }))

import { DataManagement } from '../data-management'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.read.mockResolvedValue({ version: '1.2.0' })
  mocks.restore.mockResolvedValue({ success: true, message: 'Restored' })
})
afterEach(cleanup)

it('refreshes restored data once before reporting completion', async () => {
  let finishRefresh: () => void = () => undefined
  const onDataChanged = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve
      })
  )
  render(<DataManagement onDataChanged={onDataChanged} />)
  fireEvent.change(screen.getByLabelText('Backup JSON file'), {
    target: { files: [new File(['{}'], 'backup.json')] },
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Restore backup' }))
  await waitFor(() => expect(onDataChanged).toHaveBeenCalledOnce())
  expect(onDataChanged).toHaveBeenCalledWith(true)
  expect(mocks.restore).toHaveBeenCalledWith({ version: '1.2.0' }, { clearExisting: true })
  expect(mocks.success).not.toHaveBeenCalled()
  finishRefresh()
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Restored'))
})

it.each([
  ['an Error', new Error('Subscription "Gym" has an invalid currency "us dollars"; fix it first.')],
  ['a desktop string', 'Subscription "Gym" has an invalid currency "us dollars"; fix it first.'],
])('shows why the export failed when core rejects with %s', async (_kind, rejection) => {
  mocks.exportData.mockRejectedValueOnce(rejection)
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  render(<DataManagement onDataChanged={vi.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Export backup' }))

  await waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith('Couldn’t export your data', {
      description: 'Subscription "Gym" has an invalid currency "us dollars"; fix it first.',
    })
  )
  expect(mocks.save).not.toHaveBeenCalled()
  expect(mocks.success).not.toHaveBeenCalled()
  quiet.mockRestore()
})
