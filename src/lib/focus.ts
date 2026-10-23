/**
 * Keyboard focus after in-place actions. Mark paid, Skip, Delete, and similar actions remove
 * the control that was pressed; without help the browser drops focus to `<body>` and a
 * keyboard or screen-reader user starts over from the top of the page.
 *
 * Each subscription row, card, and day-panel item marks one non-tabbable element (its name,
 * `tabIndex={-1}`) with `data-subscription-focus="<subscription id>"`; focus moves there.
 */
const FOCUS_ATTRIBUTE = 'data-subscription-focus'

/** Props for the element that receives focus on behalf of a subscription's row. */
export function subscriptionFocusProps(subscriptionId: string) {
  return { tabIndex: -1, [FOCUS_ATTRIBUTE]: subscriptionId } as const
}

/** The focus target of a subscription's row inside `root`, if it is rendered. */
export function findSubscriptionFocus(
  subscriptionId: string,
  root: ParentNode | null = document
): HTMLElement | null {
  if (!root) return null
  for (const element of root.querySelectorAll<HTMLElement>(`[${FOCUS_ATTRIBUTE}]`)) {
    if (element.getAttribute(FOCUS_ATTRIBUTE) === subscriptionId) return element
  }
  return null
}

/** The subscription whose row follows (or else precedes) this one in the same list. */
export function neighborSubscriptionId(subscriptionId: string): string | null {
  const own = findSubscriptionFocus(subscriptionId)
  const list = own?.closest('ul')
  if (!own || !list) return null
  const targets = Array.from(list.querySelectorAll<HTMLElement>(`[${FOCUS_ATTRIBUTE}]`))
  const index = targets.indexOf(own)
  return (targets[index + 1] ?? targets[index - 1])?.getAttribute(FOCUS_ATTRIBUTE) ?? null
}

/** The current page's `h1`, made programmatically focusable. */
export function pageHeading(): HTMLElement | null {
  const heading = document.querySelector<HTMLElement>('#main-content h1')
  if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
  return heading
}

/**
 * After an in-place action, move focus to `target()` if the pressed control took focus with
 * it (focus fell back to `<body>`, or to `container` when a dialog's focus trap caught it).
 * Waits a frame so React has committed the update, and never pulls focus away from where the
 * user has moved it since.
 */
export function refocusIfLost(
  target: () => HTMLElement | null | undefined,
  container?: Element | null
): void {
  requestAnimationFrame(() => {
    const active = document.activeElement
    if (active && active !== document.body && active !== container) return
    target()?.focus()
  })
}
