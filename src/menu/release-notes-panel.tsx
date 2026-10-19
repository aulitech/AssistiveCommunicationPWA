// Menu → Release notes: every version Peri has been, newest first, gathered
// under the major release it belongs to — each major folding open onto its
// versions, each version onto what it changed, and each change onto what its
// commit says.
//
// **The notes are the history, written by the release that cut each version**
// — `pnpm release` puts them into the version commit, from every commit since
// the version before (`tools/release.ts`). Nobody writes them by hand, so they
// cannot fall behind what shipped.
//
// **Loaded when the panel opens, and not before.** A third of a megabyte of
// text nobody needs to speak with has no business in what the board waits for.

import { useEffect, useRef, useState } from 'react'
import { useDwellControl } from '../ui/dwell'
import { useSettings } from '../ui/settings'
import { ScrollPane } from '../ui/controls'
import { cx, dwellVar } from '../ui/style'
import { APP_VERSION } from '../core/version'

interface NoteCommit {
  subject: string
  body: ({ text: string } | { items: string[] })[]
}

interface NoteVersion {
  version: string
  date: string
  commits: NoteCommit[]
}

/** 19 October 2026 — the date it was cut, read as a calendar day wherever the device is. */
function cutOn(date: string): string {
  const day = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(day.getTime())
    ? date
    : day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** The versions of one major release, newest first, as the notes list them. */
interface Major {
  major: string
  versions: NoteVersion[]
}

/** The notes gathered by the first number of each version, keeping their order. */
function byMajor(notes: NoteVersion[]): Major[] {
  const majors: Major[] = []
  for (const note of notes) {
    const major = note.version.split('.')[0]
    const last = majors[majors.length - 1]
    if (last?.major === major) last.versions.push(note)
    else majors.push({ major, versions: [note] })
  }
  return majors
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * **A heading that folds what is under it**, the guide's own shape: a dwell
 * control the width of the column, a triangle pointing at the heading closed
 * and at the text open, and the heading brought to the top of the pane as it
 * opens. What is closed is unmounted, so a screen reader reads only what is open.
 */
function Fold({
  title,
  detail,
  open,
  onToggle,
  level,
  children,
}: {
  title: string
  detail?: string
  open: boolean
  onToggle: () => void
  level: 'major' | 'version' | 'commit'
  children: React.ReactNode
}) {
  const { settings } = useSettings()
  const { active, props } = useDwellControl(settings.actionDwellMs, onToggle)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [open])
  const Heading = level === 'major' ? 'h3' : level === 'version' ? 'h4' : 'h5'
  return (
    <section ref={ref} className={cx('help-section', 'is-collapsible', `release-${level}`, open && 'is-open')}>
      <Heading
        className={cx('help-section-title', active && 'dwelling')}
        style={dwellVar(settings.actionDwellMs)}
        role="button"
        aria-expanded={open}
        {...props}
      >
        <span className="help-section-caret" aria-hidden="true" />
        <span className="release-title">{title}</span>
        {detail && <span className="release-detail">{detail}</span>}
        <div className="dwell-bar" key={active ? 'a' : 'i'} />
      </Heading>
      {open && children}
    </section>
  )
}

function Commit({ commit, open, onToggle }: { commit: NoteCommit; open: boolean; onToggle: () => void }) {
  return (
    <Fold title={commit.subject} level="commit" open={open} onToggle={onToggle}>
      <div className="release-body">
        {commit.body.length === 0 ? (
          <p className="help-text release-nothing">Nothing more was written about this one.</p>
        ) : (
          commit.body.map((block, i) =>
            'text' in block ? (
              <p key={i} className="help-text">
                {block.text}
              </p>
            ) : (
              <ul key={i} className="help-list">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ),
          )
        )}
      </div>
    </Fold>
  )
}

function Version({ note, open, onToggle }: { note: NoteVersion; open: boolean; onToggle: () => void }) {
  // One change open at a time, as one version is: every one open at once is
  // the whole history unfolded with extra steps.
  const [openCommit, setOpenCommit] = useState<number | null>(null)
  const changes = count(note.commits.length, 'change', 'changes')
  return (
    <Fold
      title={note.version === APP_VERSION ? `${note.version} (this version)` : note.version}
      detail={`${cutOn(note.date)} · ${changes}`}
      level="version"
      open={open}
      onToggle={onToggle}
    >
      <div className="release-commits">
        {note.commits.map((commit, i) => (
          <Commit
            key={i}
            commit={commit}
            open={openCommit === i}
            onToggle={() => setOpenCommit(current => (current === i ? null : i))}
          />
        ))}
      </div>
    </Fold>
  )
}

/**
 * **A major release, folding open onto its versions** — the newest open on
 * arrival in the newest major, and one at a time, as at every level here.
 */
function MajorRelease({
  major,
  open,
  onToggle,
  newest,
}: {
  major: Major
  open: boolean
  onToggle: () => void
  /** The newest major, whose newest version starts open. */
  newest: boolean
}) {
  const [openVersion, setOpenVersion] = useState<string | null>(
    newest ? (major.versions[0]?.version ?? null) : null,
  )
  const first = major.versions[major.versions.length - 1]
  const last = major.versions[0]
  const span = first.date === last.date ? cutOn(last.date) : `${cutOn(first.date)} to ${cutOn(last.date)}`
  return (
    <Fold
      title={`Version ${major.major}`}
      detail={`${span} · ${count(major.versions.length, 'release', 'releases')}`}
      level="major"
      open={open}
      onToggle={onToggle}
    >
      <div className="release-versions">
        {major.versions.map(note => (
          <Version
            key={note.version}
            note={note}
            open={openVersion === note.version}
            onToggle={() => setOpenVersion(current => (current === note.version ? null : note.version))}
          />
        ))}
      </div>
    </Fold>
  )
}

export function ReleaseNotesPanel() {
  const [majors, setMajors] = useState<Major[] | null>(null)
  const [failed, setFailed] = useState(false)
  // The newest open on arrival, as the guide opens on its first section.
  const [openMajor, setOpenMajor] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    import('./release-notes.json')
      .then(module => {
        if (!live) return
        const loaded = byMajor(module.default as NoteVersion[])
        setMajors(loaded)
        setOpenMajor(loaded[0]?.major ?? null)
      })
      // Offline, with the notes never fetched while online: say so rather than
      // standing there blank.
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="help-panel release-notes-panel">
      <ScrollPane className="help-scroller" paneClassName="help-body" step={120}>
        <div className="help-measure">
          <h2 className="help-title">Release notes</h2>
          {failed ? (
            <p className="help-text">
              The release notes could not be loaded. They need the internet the first time.
            </p>
          ) : majors === null ? (
            <p className="help-text release-loading" role="status">
              Loading…
            </p>
          ) : (
            majors.map((major, i) => (
              <MajorRelease
                key={major.major}
                major={major}
                newest={i === 0}
                open={openMajor === major.major}
                onToggle={() => setOpenMajor(current => (current === major.major ? null : major.major))}
              />
            ))
          )}
        </div>
      </ScrollPane>
    </div>
  )
}
