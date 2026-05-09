import { useShallow } from 'zustand/react/shallow'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUiStore } from '@/stores/ui-store'

const shortcuts = [
  { key: 'N', description: 'Add new subscription' },
  { key: '/', description: 'Focus search bar' },
  { key: 'Esc', description: 'Close dialog / modal' },
  { key: '1', description: 'Go to Dashboard' },
  { key: '2', description: 'Go to Subscriptions' },
  { key: '3', description: 'Go to Calendar' },
  { key: '4', description: 'Go to Settings' },
  { key: '?', description: 'Show this help' },
] as const

export function KeyboardShortcutsDialog() {
  const { shortcutsDialogOpen, closeShortcutsDialog } = useUiStore(
    useShallow((state) => ({
      shortcutsDialogOpen: state.shortcutsDialogOpen,
      closeShortcutsDialog: state.closeShortcutsDialog,
    }))
  )

  return (
    <Dialog open={shortcutsDialogOpen} onOpenChange={(open) => !open && closeShortcutsDialog()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-heading)] text-xl font-bold tracking-tight">
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>Navigate faster with keyboard shortcuts.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-1">
          {shortcuts.map(({ key, description }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-md px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
            >
              <span className="text-foreground font-[family-name:var(--font-sans)] text-sm">
                {description}
              </span>
              <kbd className="border-border bg-input text-muted-foreground inline-flex h-7 min-w-[28px] items-center justify-center rounded border px-2 font-[family-name:var(--font-mono)] text-[11px] font-semibold tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,0,0,0.25)]">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
