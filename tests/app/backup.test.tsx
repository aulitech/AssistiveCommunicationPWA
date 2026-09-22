// Backup and sharing: writing the board out as a file, and reading one back.
import { describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, act } from '@testing-library/react'
import { parseBackup } from '../../src/core/backup'
import { downloads, setClipboardText, unmeasuredGrid } from '../setup'
import { $$, $, settle, click, renderApp, cells } from './harness'

describe('backup & sharing', () => {
  const STORE_KEY = 'dwellspeak_phrase_store_v2'
  const MINE = { id: 'custom-seed', text: 'Put the kettle on', category: 'Kitchen' }

  const seed = (store: Record<string, unknown>) => localStorage.setItem(STORE_KEY, JSON.stringify(store))
  const openMenu = () => click($$('.icon-btn').find(b => (b.getAttribute('aria-label') ?? '').includes('menu')))
  const openBackup = () => {
    openMenu()
    click($$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing'))
  }
  const btn = (label: string) => $$('.panel-btn').find(b => b.getAttribute('aria-label') === label)
  // The scope picker is a portalled grid, so it is not under the render container.
  const inDoc = (sel: string) => [...document.body.querySelectorAll<HTMLElement>(sel)]
  const scopeTrigger = () => $('.backup-scope-trigger')
  const tile = (name: string) =>
    inDoc('.picker-tile').find(el => (el.getAttribute('aria-label') ?? '').split(' · ')[0] === name)
  const modalAction = (label: string) => inDoc('.panel-btn').find(b => b.getAttribute('aria-label') === label)
  /** Opens the grid, ticks each name, and closes it. */
  const chooseScope = (...names: string[]) => {
    click(scopeTrigger())
    for (const name of names) click(tile(name))
    click(modalAction('Done'))
  }
  /** Dwells "Save a file" and reads back the file that came out. */
  const saved = () => {
    click(btn('Save a file'))
    const file = downloads[downloads.length - 1]
    const result = parseBackup(file.text)
    if (!result.ok) throw new Error(result.error)
    return { ...file, backup: result.backup }
  }
  /** The file readers are promise-based; fake timers do not hold up microtasks. */
  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
    settle()
  }
  const cellTexts = () => cells().map(c => c.textContent)

  it('is offered in the menu', () => {
    renderApp()
    openMenu()
    const item = $$('.nav-item').find(n => n.getAttribute('aria-label') === 'Backup & sharing')
    expect(item).toBeDefined()
    expect(item?.textContent).toMatch(/save your phrases/i)
  })

  it('offers the whole app or any one category, Emergency included', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    click(scopeTrigger())
    const names = inDoc('.picker-tile').map(el => (el.getAttribute('aria-label') ?? '').split(' · ')[0])
    expect(names[0]).toBe('Everything')
    expect(names).toContain('Kitchen')
    // The emergency bar has no tab of its own, so nothing else here would let
    // its phrases be exported on their own.
    expect(names).toContain('Emergency')
    expect(tile('Everything')?.getAttribute('aria-selected')).toBe('true')
  })

  // Several categories at once is the point of a grid rather than a dropdown,
  // and the whole reason the tiles toggle instead of choosing.
  it('takes more than one category at a time', () => {
    seed({ custom: [MINE, { id: 'custom-2', text: 'Time for bed', category: 'Night' }] })
    renderApp()
    openBackup()

    chooseScope('Kitchen', 'Night')

    expect(scopeTrigger()?.textContent).toContain('Kitchen, Night')
    expect(saved().backup.scope).toEqual(['Kitchen', 'Night'])
  })

  it('unticking the last one goes back to everything', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    chooseScope('Kitchen')
    expect(scopeTrigger()?.textContent).toContain('Kitchen')

    chooseScope('Kitchen') // ticked, then unticked
    expect(scopeTrigger()?.textContent).toContain('Everything')
    expect(saved().backup.scope).toBeNull()
  })

  // Trying a selection has to be free, the same way trying a voice is.
  it('puts the choice back when the grid is cancelled', () => {
    seed({ custom: [MINE, { id: 'custom-2', text: 'Time for bed', category: 'Night' }] })
    renderApp()
    openBackup()

    chooseScope('Kitchen')
    click(scopeTrigger())
    click(tile('Night'))
    click(modalAction('Cancel'))

    expect(scopeTrigger()?.textContent).toContain('Kitchen')
    expect(saved().backup.scope).toEqual(['Kitchen'])
  })

  // Colour alone is a poor thing to read a whole grid by, and here several can
  // be on at once.
  it('marks the ticked ones with more than a colour', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    click(scopeTrigger())
    click(tile('Kitchen'))

    expect(tile('Kitchen')?.querySelector('.picker-tile-check')).not.toBeNull()
    expect(tile('Emergency')?.querySelector('.picker-tile-check')).toBeNull()
  })

  it('saves a file carrying the phrases the user wrote', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    const { filename, backup } = saved()
    expect(filename).toMatch(/^peri-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(backup.added).toContainEqual(MINE)
    expect(backup.scope).toBeNull()
  })

  it('narrows the file to the categories that are ticked', () => {
    seed({ custom: [MINE, { id: 'custom-2', text: 'Time for bed', category: 'Night' }] })
    renderApp()
    openBackup()

    chooseScope('Kitchen')
    const { filename, backup } = saved()
    expect(backup.scope).toEqual(['Kitchen'])
    expect(backup.added).toEqual([MINE])
    expect(filename).toBe(`peri-Kitchen-${backup.exported.slice(0, 10)}.json`)
  })

  it('copies the same file to the clipboard', () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()

    click(btn('Copy'))
    settle()
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const result = parseBackup(written)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.backup.added).toContainEqual(MINE)
  })

  // The whole point of the feature: a phrase written on one device turning up
  // on another one that has never seen it.
  it('brings a pasted backup in', async () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    const { text: file } = saved()

    // A second, empty device.
    cleanup()
    localStorage.removeItem(STORE_KEY)
    renderApp()
    expect(cellTexts()).not.toContain(MINE.text)

    openBackup()
    setClipboardText(file)
    click(btn('Paste a backup'))
    await flush()

    expect($('.backup-incoming')).not.toBeNull()
    click(btn("Add to what's here"))
    await flush()

    expect(cellTexts()).toContain(MINE.text)
    expect(JSON.parse(localStorage.getItem(STORE_KEY)!).custom).toContainEqual(MINE)
  })

  it('brings in a backup chosen from a file', async () => {
    // Looks for a phrase among the table's thousands, so the board has to be
    // holding all of them rather than the windowful it renders when measured.
    unmeasuredGrid()
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    const { text: file } = saved()

    cleanup()
    localStorage.removeItem(STORE_KEY)
    renderApp()
    openBackup()

    const input = $<HTMLInputElement>('.backup-file-input')!
    fireEvent.change(input, {
      target: { files: [new File([file], 'peri-backup.json', { type: 'application/json' })] },
    })
    await flush()
    click(btn("Add to what's here"))
    await flush()

    expect(cellTexts()).toContain(MINE.text)
  })

  it('says why when the file is not a backup, and imports nothing', async () => {
    renderApp()
    openBackup()

    setClipboardText('{"hello":"world"}')
    click(btn('Paste a backup'))
    await flush()

    expect($('.backup-error')?.textContent).toMatch(/isn't a Peri backup/i)
    expect($('.backup-incoming')).toBeNull()
  })

  // Replacing means making the device match the file, so a file covering one
  // category must not be able to take everything else with it.
  it('offers replacing only for a whole backup', async () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    chooseScope('Kitchen')
    const { text: partial } = saved()
    chooseScope('Everything')
    const { text: whole } = saved()

    setClipboardText(partial)
    click(btn('Paste a backup'))
    await flush()
    expect(btn('Replace everything')).toBeUndefined()

    click(btn('Cancel'))
    setClipboardText(whole)
    click(btn('Paste a backup'))
    await flush()
    expect(btn('Replace everything')).toBeDefined()
  })

  it('closes the menu onto the restored phrases', async () => {
    seed({ custom: [MINE] })
    renderApp()
    openBackup()
    const { text: file } = saved()

    cleanup()
    localStorage.removeItem(STORE_KEY)
    renderApp()
    openBackup()
    setClipboardText(file)
    click(btn('Paste a backup'))
    await flush()
    click(btn("Add to what's here"))
    await flush()

    expect($('.top-panel.open')).toBeNull()
    expect($('.toast')?.textContent).toMatch(/merged/i)
  })
})
