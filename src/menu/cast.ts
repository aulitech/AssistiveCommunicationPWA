// Menu → Cast: how to put Peri's whole screen on a TV.
//
// **Steps rather than a button**, because a web page cannot start it. Mirroring
// a screen belongs to the device — Control Centre on Apple's, Quick Settings on
// Windows, Android and ChromeOS — and Chrome's own Cast menu is the browser's;
// none of them can be opened from a page. Presentation mode's window is the one
// thing Peri can put somewhere else itself, and it shows only what is said.
//
// So the panel says how, for the device it is open on first, and folds the rest
// below for whoever is setting up somebody else's. Data rather than markup, as
// the guide is, so it can be tested without a browser.

import { type ProseSection, list, text } from '../core/prose'

export type Device = 'ipad' | 'iphone' | 'mac' | 'windows' | 'android' | 'chromebook' | 'other'
export type Browser = 'chrome' | 'edge' | 'other'

/**
 * Which device this is, from what the browser says. **An iPad says it is a
 * Mac** — Safari on iPadOS asks for desktop pages — so a "Mac" that can be
 * touched at more than one point is an iPad.
 */
export function deviceOf(userAgent: string, touchPoints: number): Device {
  if (/iPhone|iPod/.test(userAgent)) return 'iphone'
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'ipad'
  if (/Android/.test(userAgent)) return 'android'
  if (/CrOS/.test(userAgent)) return 'chromebook'
  if (/Windows/.test(userAgent)) return 'windows'
  if (/Macintosh/.test(userAgent)) return 'mac'
  return 'other'
}

/** Whether the browser has a Cast menu of its own: Chrome's, or Edge's. */
export function browserOf(userAgent: string): Browser {
  if (/Edg\//.test(userAgent)) return 'edge'
  if (/Chrome\//.test(userAgent)) return 'chrome'
  return 'other'
}

const APPLE_MIRRORING = (thing: string) =>
  text(
    `${thing} shows its whole screen on an Apple TV, or a TV that takes AirPlay, with Screen Mirroring — and its sound goes too, the device voice included.`,
  )

const APPLE_MOBILE_STEPS = list(
  'Open Control Centre: swipe down from the top-right corner of the screen. With a head mouse or a switch, open the AssistiveTouch menu and choose Control Centre.',
  'Choose Screen Mirroring — two overlapping rectangles.',
  'Choose the TV. If the TV shows a code, type it in when asked.',
  'To stop, open Control Centre again, choose Screen Mirroring, then Stop Mirroring.',
)

const STEPS: Record<Exclude<Device, 'other'>, { name: string; blocks: ProseSection['blocks'] }> = {
  ipad: { name: 'iPad', blocks: [APPLE_MIRRORING('An iPad'), APPLE_MOBILE_STEPS] },
  iphone: { name: 'iPhone', blocks: [APPLE_MIRRORING('An iPhone'), APPLE_MOBILE_STEPS] },
  mac: {
    name: 'Mac',
    blocks: [
      APPLE_MIRRORING('A Mac'),
      list(
        'Open Control Centre: the two switches near the right end of the menu bar, at the top of the screen.',
        'Choose Screen Mirroring, then the TV. If the TV shows a code, type it in when asked.',
        'To stop, choose Screen Mirroring again, then the TV again.',
      ),
    ],
  },
  windows: {
    name: 'Windows computer',
    blocks: [
      text('Windows shows its screen on a TV or an adapter that takes Miracast, as most smart TVs do.'),
      list(
        'Open Quick Settings: the network, volume and battery icons at the right end of the taskbar.',
        'Choose Cast. If it is not there, choose the pencil and add it.',
        'Choose the TV. To stop, choose Cast again, then Disconnect.',
      ),
    ],
  },
  android: {
    name: 'Android phone or tablet',
    blocks: [
      text('Android shows its screen on a Chromecast, a Google TV or a smart TV that takes casting.'),
      list(
        'Swipe down twice from the top of the screen to open Quick Settings.',
        'Choose Screen Cast — on a Samsung, Smart View. If it is not there, choose the pencil and add it.',
        'Choose the TV. To stop, open Quick Settings again and choose the same tile.',
      ),
    ],
  },
  chromebook: {
    name: 'Chromebook',
    blocks: [
      text('A Chromebook shows its screen on a Chromecast or a Google TV.'),
      list(
        'Open Quick Settings: the clock at the right end of the shelf.',
        'Choose Cast, then the TV. To stop, choose Cast again, then Stop.',
      ),
    ],
  },
}

/** Chrome's and Edge's own Cast menu, on any computer, to a Chromecast. */
const FROM_THE_BROWSER: ProseSection = {
  title: 'From Chrome or Edge, to a Chromecast',
  blocks: [
    text(
      'Chrome and Edge can show this tab, or the whole screen, on a Chromecast or a Google TV, on any computer.',
    ),
    list(
      'Chrome: open its menu — the three dots at the top right of the window — and choose Cast, save and share, then Cast.',
      'Edge: open its menu — the three dots — and choose More tools, then Cast media to device.',
      'Choose the TV. Sources, at the foot of the list, chooses between this tab and the whole screen.',
      'Casting the tab takes the sound Peri plays in it, so an ElevenLabs voice goes to the TV. A device voice is the computer’s own and may stay on its speakers.',
      'To stop, open Cast again and choose the TV again.',
    ),
  ],
}

const ORDER: Exclude<Device, 'other'>[] = ['ipad', 'iphone', 'mac', 'windows', 'android', 'chromebook']

const article = (name: string) => (/^[AEIOU]/i.test(name) ? 'an' : 'a')

/**
 * The steps, **this device first** and open on arrival, then casting from the
 * browser where this one has a Cast menu, then every other device.
 */
export function castSections(device: Device, browser: Browser): ProseSection[] {
  const desktop = device === 'mac' || device === 'windows' || device === 'chromebook' || device === 'other'
  const browserFirst = desktop && browser !== 'other'
  const here: ProseSection[] =
    device === 'other' ? [] : [{ title: `On this ${STEPS[device].name}`, blocks: STEPS[device].blocks }]
  const others = ORDER.filter(d => d !== device).map(d => ({
    title: `On ${article(STEPS[d].name)} ${STEPS[d].name}`,
    blocks: STEPS[d].blocks,
  }))
  return browserFirst ? [...here, FROM_THE_BROWSER, ...others] : [...here, ...others, FROM_THE_BROWSER]
}
