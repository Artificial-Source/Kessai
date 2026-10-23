import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog'

/** A dialog opened from state (no DialogTrigger), like every dialog in the app. */
function StateDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open from state
      </button>
      <button type="button">Other control</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>State dialog</DialogTitle>
          <DialogDescription>Opened without a trigger.</DialogDescription>
          <input aria-label="Inside" />
        </DialogContent>
      </Dialog>
    </>
  )
}

describe('DialogContent focus restoration', () => {
  it('returns focus to the element that was focused when the dialog opened', async () => {
    render(<StateDialog />)
    const opener = screen.getByRole('button', { name: 'Open from state' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = await screen.findByRole('dialog', { name: 'State dialog' })
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('falls back to Radix behaviour when nothing meaningful was focused', async () => {
    render(<StateDialog />)
    const opener = screen.getByRole('button', { name: 'Open from state' })
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.click(opener) // click without focus: activeElement stays body in jsdom

    const dialog = await screen.findByRole('dialog', { name: 'State dialog' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // No throw, and focus is not stranded inside a removed subtree.
    expect(document.activeElement?.isConnected).toBe(true)
  })
})
