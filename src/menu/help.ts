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
        'Peri is a board of phrases you speak with. Rest the pointer on a phrase to add it to the message at the top, then rest on :speak: to say it aloud. Nothing needs a click.',
      ),
      text('The screen has three parts:'),
      list(
        'The message box across the top, with its controls on its own edges.',
        'The category tabs, and below them the grid of phrases, with arrows down the right for moving through it.',
        'The blue bar at the bottom, for the things that cannot wait.',
      ),
      text('Everything the message box needs sits on its four edges rather than in a row of buttons beside it:'),
      list(
        'Along the top edge, in the middle: the three modes — :edit: on the left, Rest in the middle, :auto-speak: on the right.',
        'Top left corner: :listen:, which opens a second box for what somebody is saying to you.',
        'Top right corner: :copy:, :paste: and :speak:. The last is the largest thing on the bar, because it is the one the whole board exists to reach.',
        'Bottom left corner: :clear:, which empties the box — and afterwards offers :undo:.',
        'Bottom right corner: the language and the voice.',
      ),
      text(
        'Everything you change stays on this device. :menu: opens your details, your settings, this guide, and a way to save it all to a file. :keyboard: beside it draws a keyboard, for a device that has none you can rest on.',
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
      text('When the message is ready, the three at the top right of the box are what becomes of it:'),
      list(
        ':speak: says it aloud. It is the biggest button on the bar and it sits at the end of the row.',
        ':copy: puts it on the clipboard to send somewhere else.',
        ':paste: brings in whatever was last copied, at the point the caret is sitting — into the message, or into a phrase being written.',
      ),
      text(
        'If a paste says it was blocked, allow clipboard access for Peri in your browser settings. Firefox does not offer the clipboard to a web page at all — there, use Ctrl+V if you have a keyboard.',
      ),
      text(
        ':clear: at the bottom left of the box empties it, and then turns into :undo: so the clearing can be taken back.',
      ),
      text(
        'The last phrase you chose stays marked on the board, so you can see which one it was and where it has moved to. The mark goes as soon as you choose anything else.',
      ),
    ],
  },
  {
    title: 'Putting the phrases in a different order',
    blocks: [
      text(
        'The button at the very top of the scrolling buttons, above the one that jumps to the top, sets the order the phrases are shown in.',
      ),
      list(
        ':own-order: Custom order is your own order for that category — the order the board came in, until you arrange it yourself.',
        ':alphabetical: A to Z puts them in alphabetical order by what each one says.',
        'Recently used puts whatever you said last at the front.',
        'Most used puts whatever you say most often at the front.',
      ),
      text(
        'Every tab starts on Most used. Nothing is lost by that: a phrase you have never said keeps the place the board gave it, so a board you have only just opened looks exactly as it always did and sorts itself out as you talk.',
      ),
      text(
        'The two that go by use rearrange the board as you use it, so the phrase you just said moves to the front straight away. Nothing can be chosen for a moment afterwards, until you look somewhere else — otherwise whatever slid under the pointer would be chosen by the move itself.',
      ),
      text('Phrases you have never used sit after the ones you have, in the order the board already had them.'),
      text(
        'Peri counts what you use on this device only. It is never included in a backup and never sent anywhere, for the same reason the list of what you have said is not.',
      ),
      text(
        'Each tab keeps its own order, so you can have one category alphabetical and another by what you use most. Opening a tab brings back the order you left it in, and the button always says which one that is.',
      ),
      text(
        'The All tab is not offered Custom order, because your own order belongs to one category and All shows every category at once.',
      ),
      text('The Sent tab keeps its own order, newest first, so the button is switched off while it is showing.'),
    ],
  },
  {
    title: 'Putting the phrases in your own order',
    blocks: [
      text(
        'You can also arrange a category by hand, the same way you arrange the category tabs. Turn on :edit: mode, open the category you want, and rest on :arrange: just under the order button at the top of the scrolling buttons.',
      ),
      list(
        'Rest on a phrase to pick it up. It lifts, and the screen says what you are holding.',
        'Rest on another phrase to drop the held one there.',
        'Rest on the held phrase again to put it back where it was.',
        'With a mouse you can drag a phrase instead, if that is easier.',
      ),
      text(
        'Arranging a category switches it to Custom order and keeps what you built. Whatever order was on screen when you moved something becomes your starting point, so you can sort A to Z first and then move the few you want elsewhere.',
      ),
      text(
        'Each category has its own arrangement. All cannot be arranged, because it shows phrases from every category at once, so the arrange button is switched off there and on the Sent tab.',
      ),
      text(
        'A phrase you add later goes at the end rather than disturbing what you arranged. Rewording a phrase leaves it exactly where you put it.',
      ),
      text('Rest on :arrange: again when you are done. Leaving edit mode switches it off too.'),
    ],
  },
  {
    title: 'Phrases with a choice',
    blocks: [
      text('Some phrases have a word left open, shown underlined — for example "Please turn on/off the lights".'),
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
      list("I want the {'red', 'blue'} one", "Please turn {'on', 'off'} the lights"),
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
        ':auto-speak: to the right of the Rest bar, along the top edge of the message box, is auto-speak. It lights up when it is on, and it is on every time Peri is opened, so the board can always talk straight away.',
      ),
      text(
        'With auto-speak on, every phrase you choose is spoken the moment you choose it, and nothing is collected in the message box. This suits quick back-and-forth conversation.',
      ),
      text('The two buttons either side of Rest move between three ways of working:'),
      list(
        ':auto-speak: Auto-speak — a phrase is spoken the moment you choose it.',
        ':edit: Edit — a phrase you choose opens in the box to be reworded.',
        'Neither one on — a phrase you choose goes into the box, to be part of a longer sentence.',
      ),
      text('Turning :auto-speak: off goes to edit mode. Turning :edit: off comes back to building a message.'),
    ],
  },
  {
    title: 'Emergency phrases',
    blocks: [
      text('The blue bar along the bottom is always there, on every screen.'),
      text('Resting on one speaks it immediately — it is never added to the message box first.'),
      text(
        'These use the same dwell time as everything else, so they are no easier to trigger by accident than any other button.',
      ),
    ],
  },
  {
    title: 'Changing the phrases',
    blocks: [
      text(
        ':edit: to the left of the Rest bar, along the top edge of the message box, turns on edit mode. Auto-speak switches off while it is on: the two ask opposite things of a dwell on a phrase.',
      ),
      text(
        'In edit mode the message box is where phrases are written. Whatever is in it comes with you, so a message worth keeping becomes a phrase without being typed again.',
      ),
      text('The controls on the box mean something else while it is on, in the same places:'),
      list(
        ':save: at the end of the top row saves what is in the box — where :speak: is the rest of the time, because it is what this mode is for.',
        ':delete: removes the phrase it came from. A phrase you added goes; one that came with the app is hidden.',
        ':add: at the bottom left starts a new phrase — where :clear: is the rest of the time.',
        'A strip under the box says what is being edited, and what category it is filed under.',
        "The two at the bottom right corner become this phrase's own: the voice it is said in, and the language that voice is for.",
      ),
      text('And on the board itself:'),
      list(
        'Choose any phrase to bring it into the box and change its wording.',
        'A new phrase starts in the category and voice you last used, so adding several in a row takes one choice rather than one each.',
        'Use :add: at the end of the blue bar to add an emergency phrase.',
        ':arrange: beside it rearranges the blue bar: choose a phrase to pick it up, then choose where it should go. Choosing it again puts it back.',
      ),
      text('Links behave a little differently from other text:'),
      list(
        'Paste or drag a web link into the message box or a phrase and it becomes the name of the page. The address is still there when you copy the message, but it is not read aloud.',
        'A phrase that is only a link opens it in a new tab instead of speaking. A phrase with words around a link is still spoken as usual.',
        'If a link does not open, allow pop-ups for Peri in your browser settings. Browsers only open new tabs off the back of a tap or a key press, and dwelling is neither.',
      ),
      text('Turn :edit: off again to go back to speaking.'),
    ],
  },
  {
    title: 'Aliases',
    blocks: [
      text(
        'Open :menu: and choose Aliases. Each one is a named list of words, and a phrase that writes that name in curly brackets offers the list to choose from.',
      ),
      text(
        'Peri comes with nine — pronouns, directions, body parts and so on — and two of them start empty: contacts, and your name. Fill those in and phrases such as "This is …" and "I\'m going to call …" come to life.',
      ),
      text(
        'With one word on a list it is filled in for you; with several, you are asked which one you mean. Take words off any list, or add your own.',
      ),
      text(
        'Three buttons sit above the lists: :add: adds one of your own, called new-list until you rename it; :edit: turns every heading into a name box with an × beside it to delete that list; :undo: puts back the last list you deleted.',
      ),
      text(
        'Any list can be renamed or deleted, including the ones Peri comes with. Doing that leaves a blank in the phrases that used it, since those were written with the old name in them.',
      ),
      text(
        'The lists all start closed, so what you arrive at is their names. Choose one to open it and it comes to the top of the panel; choosing another folds the first away again.',
      ),
      text('An open list shows its words as a grid, with four buttons above it:'),
      list(
        ':alphabetical: or :own-order: switches between A to Z and the order you put the words in.',
        ':arrange: moves them: choose a word to pick it up, then choose where it should go.',
        ':edit: turns every word into a box you can retype, with an × beside it to take that word off. Words can only be deleted there, so resting on one you are simply reading cannot lose it.',
        ':undo: puts back the last word you deleted, and again for the one before that.',
      ),
      text(
        'Every box here takes the caret from where you rest: hold still over the text and the caret lands under the pointer. Keep resting and the word under it is picked out; keep resting once more and the whole box is, ready to be typed over.',
      ),
    ],
  },
  {
    title: 'Settings',
    blocks: [
      text(
        'Open :menu: and choose Settings. Back, in the top right corner, is the way out of any menu screen — and out of the menu itself.',
      ),
      text('Settings and Aliases scroll if there is more than fits, using the same arrows as the phrase grid.'),
      list(
        'Text size — how big everything is written, from half again as small to twice as large. It grows the words rather than the screen, so the board keeps the same number of phrases on it.',
        'Phrase dwell — how long to rest on a phrase before it is chosen.',
        'Action dwell — how long to rest on buttons and menus.',
        'Volume and Speed — how the voice sounds.',
        'Voice — opens a full screen of voices, with the same scroll buttons as the phrase grid. Each one speaks as you choose it, so you can try several. Done keeps the last one; Cancel puts back the one you started with.',
      ),
      text(
        'Every setting has a :reset: beside it that puts it back to how it came. It is quiet while the setting is already there.',
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
        'They use your own ElevenLabs credits. A phrase said again costs nothing — Peri keeps what it already fetched, and keeps it when you close the app.',
        'With Synchronize on, a phrase paid for on one device is not paid for again on another. The audio waits on the server, locked with your passphrase like everything else.',
        'If one cannot be fetched, Peri speaks with the device voice instead rather than saying nothing.',
        'The blue emergency bar always uses the device voice, so it stays instant and works offline.',
      ),
      text(
        'Choosing one of these voices means the words you speak are sent to ElevenLabs to be turned into audio. Unlink the account, or pick a device voice, and nothing is sent.',
      ),
      text(
        'Your key is never put in a backup file, so sharing a backup does not share your account. It does travel between your own devices if you have Synchronize on — locked with your passphrase like everything else — so the voices work on all of them without pasting the key again.',
      ),
      text(
        'The audio itself is never in a backup file either. It is kept on the device that fetched it, and with Synchronize on, on the server for your other devices. Stop and erase the copy takes all of it back.',
      ),
      text(
        'It is hidden once it is linked, with an eye to show it and a button to copy it. ElevenLabs only shows a key at the moment you make it, so this is how you get the same one onto another device without going back to them for a new one.',
      ),
      text(
        'With a lot of voices to choose from, the row of buttons above the grid narrows it — by collection for your ElevenLabs voices, by language for the ones on this device.',
      ),
    ],
  },
  {
    title: 'Speaking another language',
    blocks: [
      text(
        'Set a spoken language under Settings and Peri translates what you say before it says it. Your board does not change — you go on reading your own phrases in your own words — and what comes out of the speaker is the other language, for somebody listening who does not share yours.',
      ),
      list(
        'The phrases Peri comes with are translated already. They are instant, they work with no internet, and nothing about them is sent anywhere.',
        'Phrases you wrote yourself, phrases with a blank filled in, and messages you build out of several are not. Those are translated as you go, by Peri, using its own account — there is nothing to set up and nothing to pay for.',
        'Anything translated once is kept on the device, so the second time is instant and costs nothing.',
        'The blue emergency bar never waits for a translation. A phrase it already has, it says in your chosen language; one it does not, it says in the words you wrote — instantly, either way.',
      ),
      text(
        'The phrases you wrote yourself are sent to Google to be translated, once each, and the answer is kept on your device so they are not sent again. The phrases Peri ships are never sent anywhere, because they are translated before the app is built. Setting the language back to your device default stops all of it.',
      ),
      text(
        'Peri also picks a voice for the language, so what is said sounds like the language it is in rather than your own voice reading a foreign sentence. Choosing a particular voice yourself overrides that.',
      ),
      text(
        'There is nothing to link and no key to keep safe. Translating is part of the app, unlike a better voice, which is an account of your own — so if you ever see a phrase come out in English when it should not have, it is a phrase Peri could not reach the service for, not something you forgot to set up.',
      ),
    ],
  },
  {
    title: 'Hearing a question',
    blocks: [
      text(
        ':listen: at the top left of the message box listens to whoever is talking to you. What it hears appears in a box of its own — beside the message on a wide screen, above it on a narrow one — where you can correct it, read it in your own language, and answer it.',
      ),
      list(
        'Rest on :listen: to start, and again to stop and close the box.',
        'The box fills as the words arrive, so you can see it is working.',
        'It is the same kind of box as the message one, in the same size of writing, and it grows to match it. Rest on it to put the caret in, and rest longer to select a word or the lot — recognisers mis-hear names.',
      ),
      text('Its own controls ride its lower edge:'),
      list(
        ':clear: empties it **and starts listening again**, which is what you want when what came back was wrong. There is no separate button for the microphone.',
        ':undo: puts the words back and stops listening, if you cleared it by mistake.',
        ':translate: reads the question in your own language, underneath the words that were said.',
        ':suggest: offers a reply, and puts it in the message box.',
      ),
      text(
        'Your browser does the listening, not Peri. Most browsers send what the microphone picks up to a speech service of their own to turn it into words — the same one behind dictation elsewhere on your device. That is between you and your browser, and it does not pass through us.',
      ),
      text(
        'The first time you use it your browser asks your permission. If you refuse, the box says so and nothing else about the board changes.',
      ),
      text(
        'Nothing heard is kept. Closing the box forgets it, and it is never in a backup file and never sent to your other devices.',
      ),
    ],
  },
  {
    title: 'Getting suggested answers',
    blocks: [
      text(
        'With an Anthropic account set up under Settings, Peri can offer answers to the question that was heard — up to twenty of them, on the board, under a tab called Answers.',
      ),
      text(
        'It asks on its own as soon as the person talking to you stops, so long as the message box is empty — you do not have to ask for it. The board goes to the answers as they come, and back to where you were when the question is done with.',
      ),
      text(
        ':suggest: under the heard box asks again, which is what you want after correcting the question or clearing the box.',
      ),
      list(
        'They are only ever suggestions. Resting on one puts it in the message box — it is never spoken for you, even with auto-speak on, and you say it by resting on :speak:.',
        'You can change every word of it first, rest on another answer to swap it, or :clear: it and say something else entirely.',
        'They go when the question does. Correcting the question or closing the box takes them away, since they were answers to what was there before.',
        'It will not write over a message you have already started, and it does not ask for answers either — so a message half written is how you tell it to stay out of the way.',
        'While it is thinking, the Answers tab says so. They usually take a second or two, longer if it has to look something up.',
        'It prefers your own words. Your phrases go with the question, and the ones that answer it are offered first, word for word — with any gap left open.',
        'It answers questions about the world, and looks one up if it has to. It does not answer questions about you: it has never met you, so anything about what you did, felt or want comes back as a gap for you to fill in, with the caret landing in it when you choose that answer.',
      ),
      text(
        'The question is sent to Anthropic to be answered, on your own account and your own credits, and the phrases on your board go with it — the ones Peri comes with and any you wrote yourself. How often you use each one does not.',
      ),
      text(
        'Nothing is sent by listening alone — it goes when a reply is being written, which is as soon as a question finishes unless there is already something in the message box.',
      ),
      text(
        'Where the answer needs looking up, it is searched for on the web, so the question reaches a search index too. That takes a few seconds, which is why it only happens when the question really needs it.',
      ),
      text(
        'Your key is never in a backup file, and with Synchronize on it travels encrypted to your own devices like the ElevenLabs one.',
      ),
      text(
        'Questions from the last day are kept on this device with the answer you chose, and sent with the next question, so a conversation carries on making sense — asked "tea or coffee" and then "milk?", it knows what the second one is about.',
      ),
      text(
        'An answer you did not take is not kept. They are forgotten after a day, and the same Settings row has a button to forget them now.',
      ),
      text(
        'That row also lets you choose which model writes the answers. Quickest is the default, because somebody is waiting in front of you. Two of the others read a question more closely and take a little longer, and the last one writes more like a person and less like a form.',
      ),
      text(
        'Without a key nothing is offered and nothing is sent, and everything else about listening works exactly the same.',
      ),
    ],
  },
  {
    title: 'Finding what you have said in another language',
    blocks: [
      text(
        'Everything you say in another language is kept under a Translations tab, at the very end of the row of categories. Each button shows the words that came out, with your own wording underneath it, so you can still read the tab even though the phrases on it are not in your language.',
      ),
      list(
        'Newest first, always. The tab is a record of what you said rather than a category, so it is not one you can reorder or arrange by hand.',
        'Choosing one says it again, in that language and in the voice you chose for it. It is not translated a second time.',
        'A phrase said in two languages is on the tab twice, once for each.',
        'In edit mode, the bin forgets a translation and Save keeps it as a phrase of your own. A kept one is an ordinary phrase, spoken in whatever language the board is set to.',
      ),
      text(
        'It stays on this device. It is a record of what you actually said, so it is never in a backup file and never sent to your other devices — the same as the list of sent messages. A factory reset clears it.',
      ),
    ],
  },
  {
    title: 'A different voice for one phrase',
    blocks: [
      text(
        "In edit mode the two controls at the bottom right corner of the message box are the phrase's own rather than the board's: the voice it is said in, and the language that voice is for. Outside edit mode the same two are the board's, which is why there is only one pair to learn.",
      ),
      text(
        'The voice one opens the same full screen of voices as Settings does, and each one you try says the phrase itself rather than a sample — so you hear how that sentence sounds in it.',
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
        'A tablet by the bed and a phone in a wheelchair can hold the same board. Sign in with the same account on both, open Settings, and press Start on the Synchronize row. Anything you change on one appears on the other within a minute or so.',
      ),
      text(
        'It asks for a passphrase, and this is not a password to an account. It is the key your board is locked with before it leaves the device, and it is what the other device needs to unlock it. Choose the same one on every device, and write it down somewhere safe.',
      ),
      text(
        'The passphrase stays in that row, hidden, with an eye and a copy button beside it — so the device you set up first can give it to the next one. Copying does not put it on the screen, which matters in a room with other people in it.',
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
        "Text size and volume are left alone. They belong to the screen and the speaker in front of you — a phone at arm's length and a tablet on a mount want different numbers — so each device keeps its own. Everything else follows you: dwell times, the voice, your phrases and lists.",
      ),
      text(
        'If you have linked an ElevenLabs account, the audio it makes waits on the server too, so the second device does not spend your credits saying what the first already said. It is kept clip by clip, apart from the board, and locked the same way.',
      ),
      text(
        'Synchronize is not a backup. It keeps devices alike, which means a phrase deleted on one is deleted on the others — that is the point of it, and it is also why a saved backup file is still worth having.',
      ),
      text(
        'Stop, and this device stops sending and receiving while the copy stays where it is for the other devices. Stop and erase the copy, beside it, removes it from the server as well — the board and every clip of audio with it. Your passphrase stays either way, so starting again does not mean typing it again.',
      ),
    ],
  },
  {
    title: 'Backup and sharing',
    blocks: [
      text(
        'Open :menu: and choose Backup & sharing. Everything you have changed can be saved as one file: the phrases you added, the wording you changed, what you moved or removed, your details and your settings.',
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
