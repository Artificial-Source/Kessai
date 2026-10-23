import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ActionMenu } from '../action-menu'
import { Button } from '../button'
import { ColorSwatches } from '../color-swatches'
import { FieldError } from '../field'
import { ProgressBar } from '../progress-bar'
import { Switch } from '../switch'

describe('ActionMenu', () => {
  const renderMenu = () => {
    const onPin = vi.fn()
    const onDelete = vi.fn()
    render(
      <ActionMenu
        label="More actions for Netflix"
        items={[
          { label: 'Pin to top', onSelect: onPin },
          { label: 'Delete', onSelect: onDelete, tone: 'danger' },
        ]}
      />
    )
    return {
      onPin,
      onDelete,
      trigger: screen.getByRole('button', { name: 'More actions for Netflix' }),
    }
  }

  it('opens a named menu, focuses the first item, and moves with the arrow keys', () => {
    const { trigger } = renderMenu()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'More actions for Netflix' })
    expect(screen.getByRole('menuitem', { name: 'Pin to top' })).toHaveFocus()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: 'Pin to top' })).toHaveFocus()
  })

  it('runs the chosen item, closes, and returns focus to the trigger', () => {
    const { trigger, onDelete } = renderMenu()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape without running anything', () => {
    const { trigger, onPin, onDelete } = renderMenu()
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onPin).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })
})

describe('ColorSwatches', () => {
  it('names each swatch and reports the pressed one', () => {
    const onChange = vi.fn()
    render(
      <ColorSwatches
        label="Color"
        colors={['#8b5cf6', '#ef4444']}
        value="#8b5cf6"
        onChange={onChange}
      />
    )

    expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Violet' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Red', pressed: false }))
    expect(onChange).toHaveBeenCalledWith('#ef4444')
  })

  it('leads with the current color when it is not a preset, and keeps it after another pick', () => {
    function Picker() {
      const [value, setValue] = useState<string>('#E50914')
      return (
        <ColorSwatches
          label="Color"
          colors={['#8b5cf6', '#ef4444']}
          value={value}
          onChange={setValue}
        />
      )
    }
    render(<Picker />)

    const group = screen.getByRole('group', { name: 'Color' })
    const current = within(group).getByRole('button', { name: 'Current color #E50914' })
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getAllByRole('button')[0]).toBe(current)

    fireEvent.click(within(group).getByRole('button', { name: 'Violet' }))
    expect(within(group).getByRole('button', { name: 'Violet' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const kept = within(group).getByRole('button', { name: 'Current color #E50914' })
    expect(kept).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(kept)
    expect(kept).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Button', () => {
  it('defaults to type="button" so it never submits a surrounding form by accident', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button>Cancel</Button>
      </form>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps an explicit submit type', () => {
    render(<Button type="submit">Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit')
  })

  it('exposes the required accessible name on icon-only sizes', () => {
    render(
      <Button size="icon" aria-label="Delete Netflix">
        <svg />
      </Button>
    )

    expect(screen.getByRole('button', { name: 'Delete Netflix' })).toBeInTheDocument()
  })
})

describe('FieldError', () => {
  it('renders nothing without a message', () => {
    const { container } = render(<FieldError id="name-error" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('announces a message and can be referenced by id', () => {
    render(<FieldError id="name-error">Name is required</FieldError>)

    const message = screen.getByRole('alert')
    expect(message).toHaveTextContent('Name is required')
    expect(message).toHaveAttribute('id', 'name-error')
  })
})

describe('ProgressBar', () => {
  it('is decorative without a label', () => {
    const { container } = render(<ProgressBar value={40} />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('exposes a clamped value when labelled', () => {
    render(<ProgressBar value={140} label="Monthly budget used" />)

    const bar = screen.getByRole('progressbar', { name: 'Monthly budget used' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })
})

describe('Switch', () => {
  it('reports its state and requests the opposite state when toggled', () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Reduce motion" checked={false} onCheckedChange={onCheckedChange} />)

    const control = screen.getByRole('switch', { name: 'Reduce motion' })
    expect(control).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(control)

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('does not toggle while disabled', () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Hover effects" checked disabled onCheckedChange={onCheckedChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Hover effects' }))

    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
