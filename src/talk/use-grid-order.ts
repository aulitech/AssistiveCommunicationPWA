// What order the grid is in, and what it shows.
//
// Out of `talk.tsx`: the four arrangements, the snapshot of the usage record
// the board is ordered by, the order the Sent list is held in, and the one list
// all of that and a typed word make — see docs/decisions/ordering-the-grid.md.
// What goes in is the tab, the three records and the counts; what comes out is
// the list the grid draws and the two ways of changing its order.

import { useCallback, useMemo, useState } from 'react'
import { LIBRARY, type Phrase } from '../core/phrases'
import { search } from '../core/search'
import { heldOrder, sortPhrases } from '../core/sort'
import {
  displayCategory,
  loadPhraseSorts,
  savePhraseSorts,
  setSortFor,
  sortFor,
  type PhraseSort,
  type PhraseUsage,
} from '../core/store'
import { type Board } from './use-board'

/** One shared empty arrangement, so a category with none keeps a stable memo. */
const EMPTY_ARRANGEMENT: string[] = []

export function useGridOrder({
  board,
  tab,
  canArrange,
  showingSent,
  showingTranslated,
  showingSuggestions,
  sentPhrases,
  translatedPhrases,
  suggestions,
  counts,
  filterWord,
}: {
  board: Board
  /** The tab that is showing — a category, All, or one of the three records. */
  tab: string
  /** Whether the tab is a category of its own, where Custom order means anything. */
  canArrange: boolean
  showingSent: boolean
  showingTranslated: boolean
  showingSuggestions: boolean
  sentPhrases: Phrase[]
  translatedPhrases: Phrase[]
  suggestions: Phrase[]
  /** How much each phrase is used, as it stands now. */
  counts: PhraseUsage
  /** What has been typed since the last phrase chosen, which the grid searches Library for — or empty. */
  filterWord: string
}) {
  // Which of the four orders each tab is in. One per tab rather than one for
  // the board: the categories are not alike, and a single setting makes the
  // right answer for one of them the wrong answer everywhere else.
  const [phraseSorts, setPhraseSorts] = useState(loadPhraseSorts)

  /** What this tab is showing. A tab nobody has chosen for shows `DEFAULT_SORT`. */
  const phraseSort = sortFor(phraseSorts, tab, canArrange)

  // The hand arrangement is the shown category's own, and there is none under
  // All: its phrases come from every category at once, and ranking them against
  // each other's arrangements would interleave orders that were never about one
  // another. Applied here rather than after the filter because `sortPhrases`
  // leaves ids it does not know where they were, so the other categories' cells
  // are untouched either way.
  const handArrangement = board.store.phraseOrder[tab] ?? EMPTY_ARRANGEMENT

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
   * look somewhere else. Nothing is lost: every phrase chosen is still counted,
   * and the next tab shows the order those counts make.
   *
   * Adjusted during render rather than in an effect, which is the rule for
   * state that follows a prop — an effect would draw the old order once first.
   */
  const [ranking, setRanking] = useState(counts)
  /**
   * And the order the Sent list is shown in, held the same way and for the same
   * reason: saying a message again moves it to the front of the record, which
   * on the tab it was said from is the cell just used sliding out from under
   * the gaze that used it. The record still moves; the screen holds.
   */
  const [sentOrder, setSentOrder] = useState(() => sentPhrases.map(p => p.id))
  const showing = `${tab}\u0000${phraseSort}`
  const [rankedFor, setRankedFor] = useState(showing)
  if (rankedFor !== showing) {
    setRankedFor(showing)
    setRanking(counts)
    setSentOrder(sentPhrases.map(p => p.id))
  }

  const arrangedPhrases = useMemo(
    () => sortPhrases(board.mainPhrases, phraseSort, ranking, handArrangement),
    [board.mainPhrases, phraseSort, ranking, handArrangement],
  )

  /**
   * **What is typed searches Library, whichever tab is showing** — see `search`.
   * Library by the name it shows under, which a rename changes. In the order
   * the board lists it rather than the tab's own, since the tab may not be
   * Library at all, and `search` orders what it finds by recency anyway.
   */
  const library = displayCategory(LIBRARY, board.store.categoryRenames)
  const libraryPhrases = useMemo(
    () => board.mainPhrases.filter(p => p.category === library),
    [board.mainPhrases, library],
  )

  // Both records keep the order they happened in, newest first, and neither is
  // put through `sortPhrases` at all — which is what "always sorted by recency"
  // means for the Translations tab, exactly as it does for Sent.
  const visiblePhrases = useMemo(
    () =>
      filterWord
        ? search(libraryPhrases, filterWord, counts)
        : showingSent
          ? heldOrder(sentPhrases, sentOrder)
          : showingTranslated
            ? translatedPhrases
            : showingSuggestions
              ? suggestions
              : tab === 'all'
                ? arrangedPhrases
                : arrangedPhrases.filter(p => p.category === tab),
    [
      filterWord,
      libraryPhrases,
      counts,
      showingSent,
      showingTranslated,
      showingSuggestions,
      sentPhrases,
      sentOrder,
      translatedPhrases,
      suggestions,
      arrangedPhrases,
      tab,
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
