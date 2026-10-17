// What every browser test needs before it can say anything: a board opened as
// a guest, in the mode it asks for, and the handful of things all of them reach
// for. The browser tests' `harness.tsx`.

import { expect, type Page } from '@playwright/test'

/** A phrase somebody wrote, as the store keeps it. */
export interface Seeded {
  id: string
  text: string
  category: string
}

/**
 * Categories of the board's own. Everything Peri ships is in Library, and a
 * test about moving between tabs needs more than one. `many` is enough of them
 * that the bar runs to several rows.
 */
export function categories(names: string[]): Seeded[] {
  return names.flatMap((category, c) =>
    ['First', 'Second'].map((word, i) => ({
      id: `custom-e2e-${c}-${i}`,
      text: `${word} in ${category}`,
      category,
    })),
  )
}
export const many = () =>
  categories(Array.from({ length: 30 }, (_, i) => `Category ${String(i + 1).padStart(2, '0')}`))

/**
 * The board, signed in as a guest, with whatever the test put in the store.
 * **Page errors fail the test**: nothing that throws is allowed to pass for
 * having left the right text on screen.
 *
 * **The pause after choosing is off unless `pause` is set**, as it is in the
 * jsdom tests and for the same reason: these click one thing after another far
 * faster than anybody could with it on, and they are about everything else.
 * Written only where nothing is stored yet, so a test that reloads keeps
 * whatever it changed.
 */
export async function openBoard(
  page: Page,
  { phrases = [] as Seeded[], store = {} as object, pause = false } = {},
) {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript(
    ({ phrases, store, pause }) => {
      localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
      if (phrases.length || Object.keys(store).length) {
        localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify({ custom: phrases, ...store }))
      }
      if (!pause && !localStorage.getItem('dwellspeak_settings')) {
        localStorage.setItem('dwellspeak_settings', JSON.stringify({ selectionPauseMs: 0 }))
      }
    },
    { phrases, store, pause },
  )
  await page.goto('/')
  await expect(page.locator('.app, .still-talking').first()).toBeVisible()
  return { errors }
}

export const editMode = (page: Page) => page.locator('.edit-toggle').click()

export const tab = (page: Page, name: string) =>
  page.locator('.filter-tab[role="tab"]').filter({ hasText: new RegExp(`^${name}$`) })

/**
 * Goes to a tab — on the bar where it is there, or through More, where the
 * bar's one row had no room for it.
 */
export async function goTo(page: Page, name: string) {
  const onBar = tab(page, name)
  if (await onBar.count()) return onBar.click()
  await page.locator('.filter-more[role="tab"]').click()
  await page
    .locator('.picker-tile')
    .filter({ hasText: new RegExp(`^${name}$`) })
    .click()
  await page.locator('.picker-modal-actions .panel-btn[aria-label="Done"]').click()
  // The grid closes onto a board under a resting pointer, which is deaf for a
  // second — as a person's next dwell would, the next click waits it out.
  await page.waitForTimeout(1_100)
}

export const cell = (page: Page, text: string) =>
  page.locator('.phrase-cell').filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })

export const messageBox = (page: Page) => page.locator('.text-display')
export const activeTab = (page: Page) => page.locator('.filter-tab[aria-selected="true"]')
export const marked = (page: Page) => page.locator('.phrase-cell[aria-current="true"]')

/** Whether an element lies wholly inside another on screen. */
export async function within(page: Page, element: string, container: string) {
  return page.evaluate(
    ({ element, container }) => {
      const e = document.querySelector(element)!.getBoundingClientRect()
      const c = document.querySelector(container)!.getBoundingClientRect()
      return e.top >= c.top - 1 && e.bottom <= c.bottom + 1 && e.left >= c.left - 1 && e.right <= c.right + 1
    },
    { element, container },
  )
}

/**
 * **Speech that ends the moment it starts**, for a test about something other
 * than speaking: while anything is being said nothing but Stop answers, and how
 * long headless Chromium takes to say nothing is not something to wait on.
 */
export async function instantSpeech(page: Page) {
  await page.addInitScript(() => {
    const synth = window.speechSynthesis
    synth.speak = (u: SpeechSynthesisUtterance) => {
      setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 0)
    }
  })
}
