import type { MouseEvent } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow, type Window } from '@tauri-apps/api/window'
import { isTauriRuntime } from '@/lib/runtime'
import { cn } from '@/lib/utils'

function runWindowAction(action: (appWindow: Window) => Promise<void>) {
  action(getCurrentWindow()).catch(() => {
    // Window controls are only available inside Tauri.
  })
}

function handleTitlebarMouseDown(event: MouseEvent<HTMLDivElement>) {
  if (event.button !== 0) return

  if (event.detail === 2) {
    runWindowAction((appWindow) => appWindow.toggleMaximize())
    return
  }

  runWindowAction((appWindow) => appWindow.startDragging())
}

const controlClassName =
  'text-muted-foreground hover:text-foreground flex h-full w-11 items-center justify-center transition-colors focus-visible:outline-offset-[-2px]'

/**
 * Custom chrome for the frameless desktop window. The browser already draws its own
 * window, so in web mode this renders nothing.
 */
export function WindowTitlebar() {
  if (!isTauriRuntime()) return null

  return (
    <div className="border-border bg-background relative z-50 flex h-9 shrink-0 items-center border-b">
      <div
        className="type-label text-muted-foreground flex h-full min-w-0 flex-1 items-center pl-4 select-none"
        data-tauri-drag-region="true"
        onMouseDown={handleTitlebarMouseDown}
      >
        <span aria-hidden="true" className="pointer-events-none">
          Kessai
        </span>
      </div>

      <div className="flex h-full shrink-0 justify-end">
        <button
          type="button"
          aria-label="Minimize window"
          title="Minimize"
          className={cn(controlClassName, 'hover:bg-accent-muted')}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => runWindowAction((appWindow) => appWindow.minimize())}
        >
          <Minus size={14} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Maximize or restore window"
          title="Maximize"
          className={cn(controlClassName, 'hover:bg-accent-muted')}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => runWindowAction((appWindow) => appWindow.toggleMaximize())}
        >
          <Square size={12} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Close window"
          title="Close"
          className={cn(controlClassName, 'hover:bg-destructive hover:text-destructive-foreground')}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => runWindowAction((appWindow) => appWindow.close())}
        >
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
