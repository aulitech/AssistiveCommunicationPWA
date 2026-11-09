import { describe, it, expect } from 'vitest'
import { browserOf, castSections, deviceOf } from '../../src/menu/cast'

const UA = {
  iPadSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  iPadChrome:
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  iPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
}

describe('which device the steps are for', () => {
  // **An iPad's Safari says it is a Mac**, asking for desktop pages; what gives
  // it away is being touchable at more than one point, which a Mac is not.
  it('tells an iPad from a Mac by touch, though both say Macintosh', () => {
    expect(deviceOf(UA.iPadSafari, 5)).toBe('ipad')
    expect(deviceOf(UA.iPadSafari, 0)).toBe('mac')
    expect(deviceOf(UA.macChrome, 0)).toBe('mac')
  })

  it.each([
    [UA.iPadChrome, 5, 'ipad'],
    [UA.iPhone, 5, 'iphone'],
    [UA.windowsEdge, 0, 'windows'],
    [UA.android, 5, 'android'],
    [UA.chromebook, 0, 'chromebook'],
    [UA.firefoxLinux, 0, 'other'],
  ] as const)('reads %s as %s', (ua, touch, device) => {
    expect(deviceOf(ua, touch)).toBe(device)
  })

  it('knows the browsers with a Cast menu of their own', () => {
    expect(browserOf(UA.macChrome)).toBe('chrome')
    expect(browserOf(UA.windowsEdge)).toBe('edge')
    expect(browserOf(UA.iPadSafari)).toBe('other')
    expect(browserOf(UA.firefoxLinux)).toBe('other')
  })
})

describe('the steps', () => {
  const titles = (...args: Parameters<typeof castSections>) => castSections(...args).map(s => s.title)

  it('puts this device first, and every other device after it once', () => {
    const iPad = titles('ipad', 'other')
    expect(iPad[0]).toBe('On this iPad')
    expect(iPad).toEqual([
      'On this iPad',
      'On an iPhone',
      'On a Mac',
      'On a Windows computer',
      'On an Android phone or tablet',
      'On a Chromebook',
      'From Chrome or Edge, to a Chromecast',
    ])
  })

  // A computer whose browser has a Cast menu gets it second, before the other
  // devices: it is the other way this one can do it. A phone's browser casts
  // no tabs, so its own Quick Settings are the answer there.
  it("offers the browser's Cast menu next on a computer that has one", () => {
    expect(titles('mac', 'chrome').slice(0, 2)).toEqual(['On this Mac', 'From Chrome or Edge, to a Chromecast'])
    expect(titles('windows', 'edge').slice(0, 2)).toEqual([
      'On this Windows computer',
      'From Chrome or Edge, to a Chromecast',
    ])
    expect(titles('mac', 'other').at(-1)).toBe('From Chrome or Edge, to a Chromecast')
    expect(titles('android', 'chrome').at(-1)).toBe('From Chrome or Edge, to a Chromecast')
  })

  it('names no device as this one when it cannot tell', () => {
    const all = titles('other', 'other')
    expect(all.some(t => t.startsWith('On this'))).toBe(false)
    expect(all).toHaveLength(7)
  })

  // The same limit the guide keeps: a line longer than this is a screenful of
  // dwells on the arrows for somebody reading by gaze. And no keyboard shortcut
  // anywhere, since the people this is for have no keyboard to press one on.
  it('keeps every line short, and asks for no key to be pressed', () => {
    for (const section of castSections('other', 'chrome')) {
      for (const block of section.blocks) {
        for (const line of block.kind === 'text' ? [block.text] : block.items) {
          expect(line.length, line).toBeLessThanOrEqual(320)
          expect(line, 'a keyboard shortcut').not.toMatch(
            /\b(Cmd|Command|Ctrl|Control|Alt|Option|Win(dows)? key)\s*\+/i,
          )
        }
      }
    }
  })
})
