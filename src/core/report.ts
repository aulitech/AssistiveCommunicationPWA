// Saying out loud, in the console, that something Peri talked to went wrong.
//
// Every service call in this app is written so that failing changes as little
// as possible: sync fails into a line of text under a setting, a translation
// fails into the words as they were written, an ElevenLabs voice fails into the
// device's. That is the right behaviour and it is also exactly what makes these
// failures invisible — a board that carries on working looks like a board with
// nothing wrong, and the first question anybody debugging one has is what the
// service actually said.
//
// **Never the words, and never the key.** What goes in here is the name of the
// operation and the failure Peri already shows a user — a status code, a
// refusal, "could not reach". A phrase belongs to the person who wrote it, and
// putting one in a console puts it in every screen-share and bug report from
// then on; a key in a console is a key in a screenshot. Neither is worth the
// diagnostic.

const PREFIX = '[Peri]'

/**
 * One warning, in one shape, so they can be filtered for and grepped for.
 *
 * `where` names the thing that failed the way the source tree does —
 * `sync/pull`, `translate`, `elevenlabs/link` — and `what` is the failure in
 * the words the user would be shown.
 */
export function reportFailure(where: string, what: string) {
  // Optional at every step: a runtime without a console is not a runtime worth
  // failing in, and this is a diagnostic rather than a feature.
  globalThis.console?.warn?.(`${PREFIX} ${where}: ${what}`)
}
