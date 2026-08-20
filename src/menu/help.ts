// User guide shown under Menu → Help.
//
// Kept as data rather than markup so it stays readable, stays testable, and can
// be translated later without touching the component.
//
// Written for two readers at once: the person using the app, and whoever helps
// them set it up. Short sentences, plain words, no jargon — someone may be
// reading this while tired, and every screenful costs them dwell time.

import { type ProseBlock, type ProseSection, list, text } from '../core/prose'

export type HelpBlock = ProseBlock
export type HelpSection = ProseSection

export const HELP_SECTIONS: ProseSection[] = [
  // First, and the one the guide opens on. Somebody arriving here is usually
  // looking for one thing; this says what the screen is made of so they know
  // which heading below to open.
  {
    title: 'Overview',
    blocks: [
      text(
        'Peri is a board of phrases you speak with. Rest the pointer on a phrase to add it to the message at the top, then rest on the speaker button to say it aloud. Nothing needs a click.',
      ),
      text('The screen has four parts:'),
      list(
        'The message box across the top, with the buttons that clear, speak and copy it.',
        'A strip on the top edge of that box holding the three modes: edit on the left, Rest in the middle, auto-speak on the right.',
        'The category tabs, and below them the grid of phrases, with arrows down the right for moving through it.',
        'The red bar at the bottom, for the things that cannot wait.',
      ),
      text(
        'Everything you change stays on this device. The menu button opens your details, your settings, a guide, and a way to save it all to a file.',
      ),
    ],
  },
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
        'The buttons on the right scroll the grid: the middle two move a little at a time and keep going while you rest on them, the outer two jump to the very top or bottom.',
      ),
      text(
        'When the message is ready, rest on the speaker button to say it aloud, or the copy button to send it somewhere else.',
      ),
      text(
        'The paste button beside copy brings in whatever was last copied, at the point the caret is sitting — into the message, or into a phrase being written.',
      ),
      text(
        'If it says it was blocked, allow clipboard access for Peri in your browser settings. Firefox does not offer the clipboard to a web page at all — there, use Ctrl+V if you have a keyboard.',
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
  // The syntax, kept apart from the section above: that one is for the person
  // speaking, this one is for whoever writes the phrases. Somebody who never
  // opens the editor never needs it.
  {
    title: 'Writing a phrase with choices',
    blocks: [
      text(
        'When you write or reword a phrase in edit mode, you can leave a word open for later. Put the choices in curly brackets, each in quotes, separated by commas:',
      ),
      list(
        "I want the {'red', 'blue'} one",
        "Please turn {'on', 'off'} the lights",
      ),
      text(
        'The phrase then shows "red/blue" on the button, and choosing it asks which one you meant before putting the sentence in your message.',
      ),
      text(
        'Curly brackets with nothing in them — {} — leave a blank instead. The phrase goes into the message as it stands, with the space ready to type into.',
      ),
      text(
        'Peri also knows some lists of its own, such as {pronouns} and {bodyparts}. Those need no quotes, and you can change what is in them under Aliases.',
      ),
      text(
        'A phrase keeps what you wrote, not what it shows. Opening one to fix a typo will not flatten its choices.',
      ),
    ],
  },
  {
    title: 'Making a phrase stand out',
    blocks: [
      text(
        'A phrase can carry a little formatting, so a button can be read at a glance. It changes how the phrase looks and nothing else — the words are spoken and searched exactly as they read.',
      ),
      list(
        '**two stars** for bold, *one star* for italic',
        '~~two tildes~~ for a line through',
        '`backticks` for a typed look',
        '# at the start of a line for a heading',
        '- at the start of a line for a bullet',
        '_underscores_ work for italic too, but only between words, so a_name_like_this is left alone',
      ),
      text(
        'A star on its own stays a star, so "2 * 3" is safe to write. Nothing becomes formatting until it is closed.',
      ),
      text(
        'Formatting is kept when you copy a message, and dropped when it is spoken or searched. Typing "help" still finds a phrase written as **Help** me.',
      ),
    ],
  },
  {
    title: 'Speaking straight away',
    blocks: [
      text(
        'The speaker button to the right of the Rest bar, along the top edge of the message box, is auto-speak. It lights up when it is on, and it is on every time Peri is opened, so the board can always talk straight away.',
      ),
      text(
        'With auto-speak on, every phrase you choose is spoken the moment you choose it, and nothing is collected in the message box. This suits quick back-and-forth conversation.',
      ),
      text(
        'The two buttons either side of Rest move between three ways of working: auto-speak, editing phrases, and building a message.',
      ),
      text(
        'Turning auto-speak off goes to edit mode. Turning edit mode off comes back to building a message, where a phrase you choose goes into the box to be part of a longer sentence.',
      ),
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
      text('The pencil button to the left of the Rest bar, along the top edge of the message box, turns on edit mode. Auto-speak switches off while it is on: the two ask opposite things of a dwell on a phrase.'),
      text('In edit mode the message box is where phrases are written. Whatever is in it comes with you, so a message worth keeping becomes a phrase without being typed again, and a second strip appears along the bottom edge of the box holding the category and the voice.'),
      list(
        'Choose any phrase to bring it into the box and change its wording.',
        'The tick saves what is in the box; the bin deletes the phrase it came from; the + starts a new one.',
        'A new phrase starts in the category and voice you last used, so adding several in a row takes one choice rather than one each.',
        'Use the + at the end of the red bar to add an emergency phrase.',
        'The arrows beside it rearrange the red bar: choose a phrase to pick it up, then choose where it should go. Choosing it again puts it back.',
        'Paste or drag a web link into the message box or a phrase and it becomes the name of the page. The address is still there when you copy the message, but it is not read aloud.',
        'A phrase that is only a link opens it in a new tab instead of speaking. A phrase with words around a link is still spoken as usual.',
        'If a link does not open, allow pop-ups for Peri in your browser settings. Browsers only open new tabs off the back of a tap or a key press, and dwelling is neither.',
        'Delete removes a phrase you added, and hides one that came with the app.',
      ),
      text('Turn edit mode off again to go back to speaking.'),
    ],
  },
  {
    title: 'Aliases',
    blocks: [
      text('Open the menu and choose Aliases. Each one is a named list of words, and a phrase that writes that name in curly brackets offers the list to choose from.'),
      text(
        'Peri comes with nine — pronouns, directions, body parts and so on — and two of them start empty: contacts, and your name. Fill those in and phrases such as "This is …" and "I\'m going to call …" come to life.',
      ),
      text(
        'With one word on a list it is filled in for you; with several, you are asked which one you mean. Take words off any list, or add your own.',
      ),
      text(
        'The + at the top adds a list of your own, called new-list until you rename it. The pencil beside it turns every heading into a name box, each with an × to delete that list. The arrow beside those puts back the last list you deleted.',
      ),
      text(
        'Any list can be renamed or deleted, including the ones Peri comes with. Doing that leaves a blank in the phrases that used it, since those were written with the old name in them.',
      ),
      text(
        'The lists all start closed, so what you arrive at is their names. Choose one to open it and it comes to the top of the panel; choosing another folds the first away again.',
      ),
      text(
        'An open list shows its words as a grid, with four buttons above it. The first switches between A to Z and the order you put the words in. The second arranges them: choose a word to pick it up, then choose where it should go.',
      ),
      text(
        'The third turns every word into a box you can retype, with an × beside it to take that word off. Words can only be deleted there, so resting on one you are simply reading cannot lose it. The fourth puts back the last word you deleted, and again for the one before that.',
      ),
      text(
        'Every box here takes the caret from where you rest: hold still over the text and the caret lands under the pointer. Keep resting and the word under it is picked out; keep resting once more and the whole box is, ready to be typed over.',
      ),
    ],
  },
  {
    title: 'Settings',
    blocks: [
      text('Open the menu and choose Settings. Back, in the top right corner, is the way out of any menu screen — and out of the menu itself.'),
      text('Settings and Aliases scroll if there is more than fits, using the same arrows as the phrase grid.'),
      list(
        'Text size — how big everything is written, from half again as small to twice as large. It grows the words rather than the screen, so the board keeps the same number of phrases on it.',
        'Phrase dwell — how long to rest on a phrase before it is chosen.',
        'Action dwell — how long to rest on buttons and menus.',
        'Volume and Speed — how the voice sounds.',
        'Voice — opens a full screen of voices, with the same scroll buttons as the phrase grid. Each one speaks as you choose it, so you can try several. Done keeps the last one; Cancel puts back the one you started with.',
      ),
      text(
        'If phrases are being chosen by accident, make the dwell times longer. If waiting feels slow, make them shorter. There is no wrong setting — only what suits you.',
      ),
    ],
  },
  {
    title: 'Texting',
    blocks: [
      text(
        'The Texting category holds what the common texting acronyms stand for — "Be right back", "Talk to you later", "In my opinion" and a couple of hundred more.',
      ),
      text(
        'They are written out in full rather than as BRB or TTYL, because everything here can be spoken aloud and letters cannot. Typing the acronym still finds most of them: type "ttyl" and the grid narrows to "Talk to you later".',
      ),
      text(
        'The rude ones are in there too, with the rude word cut down to its first letter — "What the f". If you would rather they were not on your board, turn on edit mode and delete the ones you do not want.',
      ),
    ],
  },
  {
    title: 'Saying something again',
    blocks: [
      text(
        'The Sent tab, first in the row above the grid, keeps every message you speak or copy. The newest is first.',
      ),
      list(
        'Rest on one to put it back in the message box, ready to say again.',
        'The same message said twice moves back to the top rather than appearing twice.',
        'The last two hundred are kept; older ones drop off the end.',
      ),
      text(
        'In edit mode, resting on one brings it into the box to keep as a phrase of your own, or offers the bin to forget it. Forgetting is worth knowing about if you have just said something private.',
      ),
      text('This list stays on your device and is never put in a backup file.'),
    ],
  },
  {
    title: 'Better voices',
    blocks: [
      text(
        'The voices in the Voice list come from your device. They are instant, they cost nothing and they work with no internet.',
      ),
      text(
        'If you would rather not sound like a browser, you can link an ElevenLabs account under Settings. Paste the API key from your ElevenLabs account and its voices join the same list.',
      ),
      list(
        'These voices need an internet connection, and take a moment to arrive the first time — including when you try one in the voice list.',
        'They use your own ElevenLabs credits. A phrase said again costs nothing — Peri keeps what it already fetched.',
        'If one cannot be fetched, Peri speaks with the device voice instead rather than saying nothing.',
        'The red emergency bar always uses the device voice, so it stays instant and works offline.',
      ),
      text(
        'Choosing one of these voices means the words you speak are sent to ElevenLabs to be turned into audio. Unlink the account, or pick a device voice, and nothing is sent.',
      ),
      text('Your key is kept on this device and is never put in a backup file, so sharing a backup does not share your account.'),
      text(
        'It is hidden once it is linked, with Show and Copy beside it. ElevenLabs only shows a key at the moment you make it, so this is how you get the same one onto another device without going back to them for a new one.',
      ),
      text(
        'With a lot of voices to choose from, the row of buttons above the grid narrows it — by collection for your ElevenLabs voices, by language for the ones on this device.',
      ),
    ],
  },
  {
    title: 'A different voice for one phrase',
    blocks: [
      text(
        'In edit mode, the strip under the message box has a Voice setting. It opens the same full screen of voices as Settings does, and each one you try says the phrase itself rather than a sample — so you hear how that sentence sounds in it.',
      ),
      text(
        'Leave it as "Same as everything else" for almost everything. Set it where a phrase wants a voice of its own: someone you are quoting, a name said the way its owner says it, something that has to cut through a noisy room.',
      ),
      text(
        'Peri fetches that phrase the moment you choose the voice and keeps it, so saying it later is instant. That is also why an emergency phrase can have its own voice: it is already here, with nothing to wait for. If it ever is not, the emergency bar speaks with the device voice straight away rather than pausing.',
      ),
    ],
  },
  {
    title: 'Keeping two devices the same',
    blocks: [
      text(
        'A tablet by the bed and a phone in a wheelchair can hold the same board. Sign in with the same account on both, open Settings, and turn on Synchronize. Anything you change on one appears on the other within a minute or so.',
      ),
      text(
        'It asks for a passphrase, and this is not a password to an account. It is the key your board is locked with before it leaves the device, and it is what the other device needs to unlock it. Choose the same one on every device, and write it down somewhere safe.',
      ),
      text(
        'The passphrase stays in that row, hidden, with Show and Copy beside it — so the device you set up first can give it to the next one. Copying does not put it on the screen, which matters in a room with other people in it.',
      ),
      list(
        'The Code under the setting is six characters worked out from your passphrase. Two devices showing the same code agree; two showing different codes have different passphrases, and will never see each other.',
        'A passphrase typed differently is not an error message. It is simply a different board, so nothing arrives and nothing is lost.',
        'Nobody can reset it for you. We cannot read your board and cannot help you open it.',
      ),
      text(
        'The first device to turn it on publishes what it has. When a second device joins and already has phrases of its own, it asks which board to keep — nothing is replaced until you answer.',
      ),
      text(
        'After that, the last change wins. Edit on two devices without letting them meet in between and the earlier edit is the one that goes, so it is worth letting each device settle before picking up the other.',
      ),
      text(
        'Synchronize is not a backup. It keeps devices alike, which means a phrase deleted on one is deleted on the others — that is the point of it, and it is also why a saved backup file is still worth having.',
      ),
      text(
        'Turn it off and this device stops sending and receiving; the copy stays where it is for the other devices. Stop and erase the copy removes it from the server as well.',
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
        'What to save opens a full screen of categories. Everything is the default; tick as many single categories as you like instead — useful for passing a set of phrases to someone else.',
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
        'The one exception is a linked ElevenLabs account: choosing one of its voices sends the words you speak to ElevenLabs to be spoken back. Everything else still works with no connection, including the emergency bar.',
      ),
      text(
        'Because of that, clearing your browser data would take them with it. Save a backup from time to time — see Backup and sharing above.',
      ),
    ],
  },
]
