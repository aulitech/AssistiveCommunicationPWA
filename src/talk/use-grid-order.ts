// What order the grid is in, and what it shows.
//
// Out of `talk.tsx`: the four arrangements, the snapshot of the usage record
// the board is ordered by, and the one list all of that and a typed word make — see docs/decisions/ordering-the-grid.md.
// What goes in is the tab, the two records and the counts; what comes out is
// the list the grid draws and the two ways of changing its order.

import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { cancelAllDwells, holdDwellsUntilMoved } from '../ui/dwell'
import { LIBRARY, type Phrase } from '../core/phrases'
import { search } from '../core/search'
import { sortPhrases } from '../core/sort'
import {
  loadPhraseSorts,
  savePhraseSorts,
  setSortFor,
  sortFor,
  type PhraseSort,
  type PhraseUsage,
} from '../core/store'
import { type Board } from './use-board'

/**
 * **How far the pointer goes before anything can be chosen**, once the board
 * has taken its new order after something said. The cell that arrived under a
 * pointer still resting where the last phrase was chosen is not what it was
 * aimed at.
 */
const AFTER_SPEAKING_PX = 20

const sameOrder = (a: Phrase[], b: Phrase[]) => a.length === b.length && a.every((p, i) => p.id === b[i]!.id)

/** One shared empty arrangement, so a category with none keeps a stable memo. */
const EMPTY_ARRANGEMENT: string[] = []
const EMPTY_PHRASES: Phrase[] = []

export function useGridOrder({
  board,
  tab,
  canArrange,
  showingTranslated,
  showingSuggestions,
  translatedPhrases,
  suggestions,
  counts,
  filterWord,
  saidTimes,
}: {
  board: Board
  /** The tab that is showing — Library, a category, or one of the two records. */
  tab: string
  /** Whether the tab is a category of its own, where Custom order means anything. */
  canArrange: boolean
  showingTranslated: boolean
  showingSuggestions: boolean
  translatedPhrases: Phrase[]
  suggestions: Phrase[]
  /** How much each phrase is used, as it stands now. */
  counts: PhraseUsage
  /** What has been typed since the last phrase chosen, which the grid searches Library for — or empty. */
  filterWord: string
  /** How many times something said has come to an end. The board takes its new order each time. */
  saidTimes: number
}) {
  // Which of the four orders each tab is in. One per tab rather than one for
  // the board: the categories are not alike, and a single setting makes the
  // right answer for one of them the wrong answer everywhere else.
  const [phraseSorts, setPhraseSorts] = useState(loadPhraseSorts)

  /** What this tab is showing. A tab nobody has chosen for shows `DEFAULT_SORT`. */
  const phraseSort = sortFor(phraseSorts, tab, canArrange)

  // The hand arrangement: Library's own, or none for a category — whose
  // references are held in its own order already, which is its Custom order.
  const handArrangement = tab === LIBRARY ? board.store.libraryOrder : EMPTY_ARRANGEMENT
  /** What the tab holds before it is ordered: Library, or a category's references. */
  const { phrasesOf } = board
  const tabPhrases = useMemo(() => (canArrange ? phrasesOf(tab) : EMPTY_PHRASES), [canArrange, phrasesOf, tab])

  /**
   * **The record the board is ordered by, taken when they last changed what
   * they are looking at** — a tab, or an order. Not the live record.
   *
   * An order that goes by use used to rearrange the board on the very dwell
   * that chose a phrase: the cell just used slid to the front, everything else
   * moved around it, and the next thing somebody looked for was not where they
   * had left it. The order is not wrong — it is what "most used" means — but it
   * cannot be applied to the board somebody is in the middle of reading.
   *
   * So the ranking is held while a tab is on screen and taken again when they
   * look somewhere else — **or when something said comes to an end**. The
   * board is still while the words are said, Stop over the top row and nothing
   * else answering, and somebody who has just said a phrase is not in the
   * middle of reading the board: they are at the end of a sentence. So the
   * phrase just said takes its place there, and nothing can be chosen until the
   * pointer has moved — see `AFTER_SPEAKING_PX`.
   *
   * Adjusted during render rather than in an effect, which is the rule for
   * state that follows a prop — an effect would draw the old order once first.
   */
  const [ranking, setRanking] = useState(counts)
  const showing = `${tab}\u0000${phraseSort}`
  const [rankedFor, setRankedFor] = useState(showing)
  if (rankedFor !== showing) {
    setRankedFor(showing)
    setRanking(counts)
  }

  const arrangedPhrases = useMemo(
    () => sortPhrases(tabPhrases, phraseSort, ranking, handArrangement),
    [tabPhrases, phraseSort, ranking, handArrangement],
  )

  // Counted each time the board takes a new order because something said
  // ended, and a cell on screen moved for it. Only then: an order that came out
  // the same — a phrase said again under A to Z, an emergency phrase, which is
  // counted nowhere — moved nothing, and holding the dwells would only make
  // somebody saying the next thing wait.
  const [heardSaid, setHeardSaid] = useState(saidTimes)
  const [movedBySpeech, setMovedBySpeech] = useState(0)
  if (heardSaid !== saidTimes) {
    setHeardSaid(saidTimes)
    if (ranking !== counts) {
      const onScreen = !filterWord && !showingTranslated && !showingSuggestions
      if (onScreen && !sameOrder(sortPhrases(tabPhrases, phraseSort, counts, handArrangement), arrangedPhrases)) {
        setMovedBySpeech(n => n + 1)
      }
      setRanking(counts)
    }
  }
  // Before the browser paints the new order: a dwell begun on the old one is
  // stopped, and nothing starts until the pointer is aimed somewhere.
  useLayoutEffect(() => {
    if (movedBySpeech === 0) return
    cancelAllDwells()
    holdDwellsUntilMoved(AFTER_SPEAKING_PX)
  }, [movedBySpeech])

  /**
   * **What is typed searches Library, whichever tab is showing** — see `search`.
   * In the board's order rather than the tab's own, since the tab may not be
   * Library at all, and `search` orders what it finds by recency anyway.
   */
  const library = board.mainPhrases

  // Translations keeps the order it happened in, newest first, and is not put
  // through `sortPhrases` at all — which is what "always sorted by recency"
  // means for it.
  const visiblePhrases = useMemo(
    () =>
      filterWord
        ? search(library, filterWord, counts)
        : showingTranslated
          ? translatedPhrases
          : showingSuggestions
            ? suggestions
            : arrangedPhrases,
    [
      filterWord,
      library,
      counts,
      showingTranslated,
      showingSuggestions,
      translatedPhrases,
      suggestions,
      arrangedPhrases,
    ],
  )

  /**
   * A different arrangement moves every cell on the board at once. The picker
   * holds the dwells on its way out, which is what stops the phrase arriving
   * under a resting pointer being spoken by the change itself.
   */
  // Remembered against the tab it was chosen under, so coming back to a
  // category brings back the order it was left in.
  const chooseSort = useCallback(
    (next: PhraseSort) => {
      const sorts = setSortFor(phraseSorts, tab, next)
      savePhraseSorts(sorts)
      setPhraseSorts(sorts)
    },
    [phraseSorts, tab],
  )

  /**
   * A move captures the order that was on screen and makes it the user's own,
   * exactly as a category move does — and switches the grid to Custom order,
   * since an arrangement nobody is looking at is not an arrangement.
   *
   * The list handed over is what is actually shown. In edit mode that is the
   * whole category, because a typed word never narrows the grid there.
   */
  const handleReorderPhrases = useCallback(
    (from: string, to: string) => {
      board.reorderPhrases(
        tab,
        visiblePhrases.map(p => p.id),
        from,
        to,
      )
      chooseSort('custom')
    },
    [board, tab, visiblePhrases, chooseSort],
  )

  return { phraseSort, visiblePhrases, chooseSort, handleReorderPhrases }
}
