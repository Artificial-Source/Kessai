import { Fragment } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { useUiStore } from '@/stores/ui-store'
import { modifierKeyLabel } from '@/lib/keyboard'

const MOD = 'mod'

type Shortcut = {
  description: string
  /** Each entry is one chord; several entries are alternatives ("or"). */
  keys: string[][]
}

type ShortcutGroup = {
  title: string
  shortcuts: Shortcut[]
}

/**
 * Every shortcut Kessai implements. Sources: `useKeyboardShortcuts` (global),
 * `CalendarPage` (month navigation), and `CommandPalette` (list navigation).
 * Keep this list in sync when a binding changes.
 */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'General',
    shortcuts: [
      { description: 'Open command palette', keys: [[MOD, 'K']] },
      { description: 'Add subscription', keys: [['N']] },
      { description: 'Show keyboard shortcuts', keys: [['?']] },
      { description: 'Close dialog or palette', keys: [['Esc']] },
    ],
  },
  {
    title: 'Go to',
    shortcuts: [
      { description: 'Dashboard', keys: [['1']] },
      { description: 'Subscriptions', keys: [['2']] },
      { description: 'Calendar', keys: [['3']] },
      { description: 'Settings', keys: [['4']] },
    ],
  },
  {
    title: 'Subscriptions',
    shortcuts: [{ description: 'Focus search', keys: [['/']] }],
  },
  {
    title: 'Calendar',
    shortcuts: [
      { description: 'Previous month', keys: [[MOD, '←'], ['PgUp']] },
      { description: 'Next month', keys: [[MOD, '→'], ['PgDn']] },
      { description: 'Jump to today', keys: [['T']] },
      { description: 'Close day panel', keys: [['Esc']] },
    ],
  },
  {
    title: 'Command palette',
    shortcuts: [
      { description: 'Move selection', keys: [['↑'], ['↓']] },
      { description: 'Open selected result', keys: [['Enter']] },
    ],
  },
]

function ShortcutKeys({ keys, mod }: { keys: string[][]; mod: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {keys.map((chord, chordIndex) => (
        <Fragment key={chord.join('+')}>
          {chordIndex > 0 ? <span className="text-muted-foreground text-xs">or</span> : null}
          <span className="flex items-center gap-1">
            {chord.map((key) => (
              <Kbd key={key}>{key === MOD ? mod : key}</Kbd>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

export function KeyboardShortcutsDialog() {
  const { shortcutsDialogOpen, closeShortcutsDialog } = useUiStore(
    useShallow((state) => ({
      shortcutsDialogOpen: state.shortcutsDialogOpen,
      closeShortcutsDialog: state.closeShortcutsDialog,
    }))
  )
  const mod = modifierKeyLabel()

  return (
    <Dialog open={shortcutsDialogOpen} onOpenChange={(open) => !open && closeShortcutsDialog()}>
      <DialogContent className="sm:max-w-lg md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts work anywhere outside a text field.
          </DialogDescription>
        </DialogHeader>

        <div className="md:columns-2 md:gap-6">
          {SHORTCUT_GROUPS.map((group) => {
            const headingId = `shortcuts-${group.title.toLowerCase().replace(/\s+/g, '-')}`
            return (
              <section
                key={group.title}
                aria-labelledby={headingId}
                className="mb-5 break-inside-avoid last:mb-0"
              >
                <h3 id={headingId} className="type-label text-muted-foreground mb-1.5">
                  {group.title}
                </h3>
                <dl className="divide-border border-border divide-y rounded-md border">
                  {group.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className="flex min-h-10 items-center justify-between gap-4 px-3 py-1.5"
                    >
                      <dt className="text-foreground text-sm">{shortcut.description}</dt>
                      <dd>
                        <ShortcutKeys keys={shortcut.keys} mod={mod} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
