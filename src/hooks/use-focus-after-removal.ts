import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import { refocusIfLost } from '@/lib/focus'

/**
 * Keeps keyboard focus in a list whose items disappear once an in-place action lands
 * (a recorded payment, a reviewed subscription). Each item marks its name with
 * `attribute="<key>"` and `tabIndex={-1}`.
 *
 * Call `expectRemoval(key)` when an item's action succeeds (or is applied optimistically):
 * once `renderedKeys` no longer contains it and focus fell to `<body>`, focus moves to the
 * item that followed it, else the one before it, else `fallback` (the section heading).
 */
export function useFocusAfterRemoval(
  rootRef: RefObject<HTMLElement | null>,
  fallback: RefObject<HTMLElement | null>,
  attribute: string,
  renderedKeys: readonly string[]
) {
  const intent = useRef<{ key: string; neighbors: string[] } | null>(null)

  const find = useCallback(
    (key: string) =>
      rootRef.current?.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(key)}"]`) ?? null,
    [rootRef, attribute]
  )

  const signature = renderedKeys.join('\u0000')
  useLayoutEffect(() => {
    const pending = intent.current
    if (!pending || signature.split('\u0000').includes(pending.key)) return
    intent.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    const next = pending.neighbors.map(find).find(Boolean) ?? fallback.current
    next?.focus()
  }, [signature, find, fallback])

  const expectRemoval = useCallback(
    (key: string) => {
      const order = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(`[${attribute}]`) ?? []
      ).map((element) => element.getAttribute(attribute) ?? '')
      const index = order.indexOf(key)
      intent.current = {
        key,
        neighbors: index < 0 ? [] : [order[index + 1], order[index - 1]].filter(Boolean),
      }
    },
    [rootRef, attribute]
  )

  /** Drop a pending move, e.g. when the action failed and the item stays. */
  const cancelRemoval = useCallback(() => {
    intent.current = null
  }, [])

  /** After an action, put focus back on this item's name if the pressed control took it. */
  const keepFocusOn = useCallback(
    (key: string) => refocusIfLost(() => find(key) ?? fallback.current),
    [find, fallback]
  )

  return { expectRemoval, cancelRemoval, keepFocusOn }
}
