// Shared shape for the app's long-form text — the help guide and the legal
// pages. Kept as data rather than markup so it stays readable and testable.

export type ProseBlock = { kind: 'text'; text: string } | { kind: 'list'; items: string[] }

export interface ProseSection {
  title: string
  blocks: ProseBlock[]
}

export interface ProseDocument {
  title: string
  updated: string
  intro?: string
  sections: ProseSection[]
}

export const text = (t: string): ProseBlock => ({ kind: 'text', text: t })
export const list = (...items: string[]): ProseBlock => ({ kind: 'list', items })
