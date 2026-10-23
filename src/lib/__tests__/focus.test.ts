import { afterEach, describe, expect, it } from 'vitest'
import { findSubscriptionFocus, neighborSubscriptionId, refocusIfLost } from '../focus'

function rows(listIds: string[][]) {
  document.body.innerHTML = listIds
    .map(
      (ids) =>
        `<ul>${ids.map((id) => `<li><span tabindex="-1" data-subscription-focus="${id}">${id}</span><button>${id} action</button></li>`).join('')}</ul>`
    )
    .join('')
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('neighborSubscriptionId', () => {
  it('prefers the next row, then the previous one, within the same list', () => {
    rows([
      ['a', 'b', 'c'],
      ['x', 'y'],
    ])
    expect(neighborSubscriptionId('b')).toBe('c')
    expect(neighborSubscriptionId('c')).toBe('b')
    expect(neighborSubscriptionId('y')).toBe('x')
  })

  it('returns null for a lone or unrendered row', () => {
    rows([['only']])
    expect(neighborSubscriptionId('only')).toBeNull()
    expect(neighborSubscriptionId('missing')).toBeNull()
  })
})

describe('refocusIfLost', () => {
  it('moves focus to the target once the pressed control is gone', async () => {
    rows([['a', 'b']])
    const pressed = document.querySelector('button')!
    pressed.focus()
    pressed.remove()
    expect(document.activeElement).toBe(document.body)

    refocusIfLost(() => findSubscriptionFocus('a'))
    await nextFrame()
    expect(document.activeElement).toBe(findSubscriptionFocus('a'))
  })

  it('leaves focus where the user has moved it', async () => {
    rows([['a', 'b']])
    const elsewhere = document.querySelectorAll('button')[1]
    elsewhere.focus()

    refocusIfLost(() => findSubscriptionFocus('a'))
    await nextFrame()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('treats focus caught by the surrounding container as lost', async () => {
    rows([['a']])
    const container = document.querySelector('ul')!
    container.tabIndex = -1
    container.focus()

    refocusIfLost(() => findSubscriptionFocus('a'), container)
    await nextFrame()
    expect(document.activeElement).toBe(findSubscriptionFocus('a'))
  })
})
