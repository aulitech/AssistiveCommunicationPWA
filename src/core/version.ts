// Which release of Peri this is.
//
// **A semantic version, bumped with every merge to main**: the major number for
// a change that breaks something somebody relied on — a backup or a board from
// another device that an older release can no longer read, a feature taken
// away — the minor for anything new a person can see or do, and the patch for
// the rest. Written once, in `package.json`, and put into the bundle by
// `vite.config.ts`, so it is right on a device that is offline.
//
// It is the answer to "which one are you on?", which is the first question
// anybody helping with a board over the phone asks — and the menu is where
// somebody who cannot read a settings screen at arm's length is shown it.

export const APP_VERSION: string = __APP_VERSION__
