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
 * The board, signed in as a guest, with whatever the test put in the store.
 * **Page errors fail the test**: nothing that throws is allowed to pass for
 * having left the right text on screen.
 */
export async function openBoard(page: Page, { phrases = [] as Seeded[], store = {} as object } = {}) {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript(
    ({ phrases, store }) => {
      localStorage.setItem('dwellspeak_user', JSON.stringify({ name: 'Guest', email: '', provider: 'guest' }))
      if (phrases.length || Object.keys(store).length) {
        localStorage.setItem('dwellspeak_phrase_store_v2', JSON.stringify({ custom: phrases, ...store }))
      }
    },
    { phrases, store },
  )
  await page.goto('/')
  await expect(page.locator('.app, .still-talking').first()).toBeVisible()
  return { errors }
}

/** The board opens in auto-speak; two dwells on the edit toggle leave it composing. */
export async function composing(page: Page) {
  await page.locator('.edit-toggle').click()
  await page.locator('.edit-toggle').click()
}

export const editMode = (page: Page) => page.locator('.edit-toggle').click()

export const tab = (page: Page, name: string) =>
  page.locator('.filter-tab[role="tab"]').filter({ hasText: new RegExp(`^${name}$`) })

export const cell = (page: Page, text: string) =>
  page.locator('.phrase-cell').filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })

export const messageBox = (page: Page) => page.locator('.text-display')
export const activeTab = (page: Page) => page.locator('.filter-tab[aria-selected="true"]')
export const draftCategory = (page: Page) => page.locator('.category-trigger .picker-trigger-label')
export const marked = (page: Page) => page.locator('.phrase-cell[aria-current="true"]')

/** Files the draft under a category, through the grid the strip opens. */
export async function fileUnder(page: Page, category: string) {
  await page.locator('.category-trigger').click()
  await page
    .locator('.picker-tile')
    .filter({ has: page.locator('.picker-tile-name', { hasText: new RegExp(`^${category}$`) }) })
    .click()
  await page.locator('.picker-modal-actions .panel-btn[aria-label="Done"]').click()
}

/** How far an element's centre sits from its container's, across or down. */
export async function offCentre(page: Page, element: string, container: string, axis: 'x' | 'y') {
  return page.evaluate(
    ({ element, container, axis }) => {
      const e = document.querySelector(element)!.getBoundingClientRect()
      const c = document.querySelector(container)!.getBoundingClientRect()
      return axis === 'x'
        ? Math.abs((e.left + e.right) / 2 - (c.left + c.right) / 2)
        : Math.abs((e.top + e.bottom) / 2 - (c.top + c.bottom) / 2)
    },
    { element, container, axis },
  )
}

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
