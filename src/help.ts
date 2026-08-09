// User guide shown under Menu → Help.
//
// Kept as data rather than markup so it stays readable, stays testable, and can
// be translated later without touching the component.
//
// Written for two readers at once: the person using the app, and whoever helps
// them set it up. Short sentences, plain words, no jargon — someone may be
// reading this while tired, and every screenful costs them dwell time.

import { type ProseBlock, type ProseSection, list, text } from './prose'

export type HelpBlock = ProseBlock
export type HelpSection = ProseSection

export const HELP_SECTIONS: ProseSection[] = [
  {
    title: 'How selecting works',
    blocks: [
      text(
        'Peri is operated by resting, not clicking. Move the pointer onto a button and hold it still. A bar fills to show the button is being chosen, and it activates when the bar completes.',
      ),
      text('Move away before the bar fills and nothing happens, so a wrong turn costs you nothing.'),
      text('Clicking, tapping and the keyboard all work too, if any of those are easier for you.'),
    ],
  },
  {
    title: 'Building a message',
    blocks: [
      text('The box at the top holds the message you are putting together.'),
      list(
        'Rest on any phrase in the grid to add it to the box.',
        'Type in the box to narrow the grid to phrases that match what you are typing.',
        'Use the tabs above the grid to show one category at a time.',
        'The arrows on the right scroll the grid.',
      ),
      text(
        'When the message is ready, rest on the speaker button to say it aloud, or the copy button to send it somewhere else.',
      ),
      text('The button on the left clears the message, and afterwards offers to undo the clearing.'),
    ],
  },
  {
    title: 'Phrases with a choice',
    blocks: [
      text(
        'Some phrases have a word left open, shown underlined — for example "Please turn on/off the lights".',
      ),
      text(
        'Choosing one of these opens a short chooser. Pick the word you want and the finished sentence goes into your message.',
      ),
      text(
        'A phrase showing ___ has a blank with nothing behind it yet. It is added as it stands, with the blank ready to type over.',
      ),
    ],
  },
  {
    title: 'Speaking straight away',
    blocks: [
      text(
        'The speaker button at the top of the right-hand column turns on auto-speak. It lights up when it is on.',
      ),
      text(
        'With auto-speak on, every phrase you choose is spoken the moment you choose it, and nothing is collected in the message box.',
      ),
      text('This suits quick back-and-forth conversation. Turn it off to go back to building longer messages.'),
    ],
  },
  {
    title: 'Emergency phrases',
    blocks: [
      text('The red bar along the bottom is always there, on every screen.'),
      text('Resting on one speaks it immediately — it is never added to the message box first.'),
      text(
        'These use the same dwell time as everything else, so they are no easier to trigger by accident than any other button.',
      ),
    ],
  },
  {
    title: 'Changing the phrases',
    blocks: [
      text('The pencil button in the right-hand column turns on edit mode.'),
      list(
        'Choose any phrase to change its wording.',
        'Choose the message box to add a new phrase of your own.',
        'Use the + at the end of the red bar to add an emergency phrase.',
        'Delete removes a phrase you added, and hides one that came with the app.',
      ),
      text('Turn edit mode off again to go back to speaking.'),
    ],
  },
  {
    title: 'Your details',
    blocks: [
      text('Open the menu and choose My details to add your name and the people you talk about.'),
      text(
        'Phrases such as "This is …" and "I\'m going to call …" then use what you entered. With one contact saved the name is filled in for you; with several, you are asked which one you mean.',
      ),
    ],
  },
  {
    title: 'Settings',
    blocks: [
      text('Open the menu and choose Settings.'),
      list(
        'Phrase dwell — how long to rest on a phrase before it is chosen.',
        'Action dwell — how long to rest on buttons and menus.',
        'Volume and Speed — how the voice sounds.',
        'Voice — which voice speaks, from the voices on this device.',
      ),
      text(
        'If phrases are being chosen by accident, make the dwell times longer. If waiting feels slow, make them shorter. There is no wrong setting — only what suits you.',
      ),
    ],
  },
  {
    title: 'Backup and sharing',
    blocks: [
      text(
        'Open the menu and choose Backup & sharing. Everything you have changed can be saved as one file: the phrases you added, the wording you changed, what you moved or removed, your details and your settings.',
      ),
      list(
        'Save a file keeps a copy in your downloads. Copy puts the same thing on the clipboard.',
        'Tick a category instead of Everything to save just that one — useful for passing a set of phrases to someone else.',
        'Choose a file, or Paste a backup, to bring one in.',
      ),
      text(
        'Bringing a backup in offers two ways to do it. Add to what’s here keeps everything already on this device and never removes a phrase. Replace everything makes this device match the file exactly, including anything the file had removed.',
      ),
      text('The phrases Peri came with are already in the app, so they are not in the file. It stays small.'),
    ],
  },
  {
    title: 'Keyboard and switch access',
    blocks: [
      text(
        'Every button can be reached with the Tab key and activated with Enter or the space bar, so the app can be used with a keyboard or a switch instead of a pointer.',
      ),
      text('The button currently in focus is outlined, so you can always see where you are.'),
    ],
  },
  {
    title: 'Using it offline',
    blocks: [
      text(
        'Peri can be installed to a home screen from your browser menu. Once installed it opens like any other app and keeps working with no internet connection.',
      ),
      text(
        'Your phrases, your details and your settings are stored on this device only. Nothing is uploaded, and signing in does not change that.',
      ),
      text(
        'Because of that, clearing your browser data would take them with it. Save a backup from time to time — see Backup and sharing above.',
      ),
    ],
  },
]
