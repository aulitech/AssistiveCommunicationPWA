// Privacy policy and terms of service, served at /privacy and /terms.
//
// These describe what the app actually does today: everything is stored on the
// device, and the one thing that ever leaves it — a synchronized board — is
// encrypted here first, under a passphrase we do not have and cannot reset. If
// anything else ever changes — analytics, crash reporting, a server that can
// read something — this file has to change in the same commit, or it becomes a
// false claim.
//
// The three places that have to agree about synchronizing are the Synchronize
// row in Settings, the **Synchronizing** section of the guide, and the section
// below. Change one and change all three.
//
// Not written by a lawyer. Accurate, but worth review before it is relied on.

import { type ProseDocument, list, text } from '../core/prose'

// One date each: the policy says its date changes whenever it does, and the
// terms have not changed with it.
const PRIVACY_UPDATED = '22 September 2026'
const TERMS_UPDATED = '20 August 2026'
const CONTACT = 'spero@auli.tech'
const ENTITY = 'Autonomous Living Technologies, Inc.'

export const PRIVACY: ProseDocument = {
  title: 'Privacy Policy',
  updated: PRIVACY_UPDATED,
  intro:
    'Peri is built for people who rely on it to say things they cannot otherwise say. That makes what happens to those words important. The short version: they stay on your device. Five things are exceptions, and each is yours to switch on. Linking an ElevenLabs account sends the words you speak to ElevenLabs to be turned into audio. Setting a spoken language sends the phrases you wrote yourself to Google to be translated. Turning on Synchronize puts an encrypted copy of your board on our server so your other devices can fetch it, and we cannot read that copy. Using the microphone lets your browser send what it hears to a speech service of its own. And asking for suggested answers sends that question, with the phrases on your board, to Anthropic on your own account.',
  sections: [
    {
      title: 'What we collect',
      blocks: [
        text(
          'Nothing you can read. We run no analytics and no tracking, and the one server we do run stores encrypted blocks it has no way to open.',
        ),
        text('Everything the app remembers is stored in your browser, on your device:'),
        list(
          'The phrases you add, edit or hide.',
          'Your settings — dwell times, voice, volume and speed.',
          'Your word lists — names, contacts and anything else you add under Aliases.',
          'Which account you last signed in with, if any.',
          'Your ElevenLabs API key, if you linked an account.',
          'Your Anthropic API key, if you set one up for suggested answers.',
          'The audio a linked ElevenLabs account has made for you, so that a phrase you have paid to have spoken is not paid for twice.',
          'Your Synchronize passphrase, if you turned that on.',
          'How often you use each phrase and when you last used one, which is what lets the grid be ordered by what you use.',
          'The messages you have spoken or copied, under the Sent tab.',
          'What you have said in another language, and which language, under the Translations tab.',
          'Questions you asked for a suggested reply to, and the replies, for a day.',
        ),
        text(
          'Everything on that list but the account you signed in with belongs to that account. Somebody who signs in on the same device with a different account gets a board of their own, and cannot open yours. Every guest on a device shares one guest board, so anything kept while you are a guest can be seen by whoever continues as a guest next.',
        ),
        text(
          'That keeps boards apart inside the app. It does not lock them: your browser keeps every board on the device unencrypted, where anybody who can open its developer tools can read them.',
        ),
        text(
          'None of this leaves your device unless you turn on Synchronize, and what leaves then is encrypted — see the Synchronizing section. No API key and no Synchronize passphrase is ever included in a backup file, so sharing a backup does not share your account or your other devices. The passphrase never leaves your device at all; the keys travel between your own devices, inside the encryption, so what you pay for works on all of them.',
        ),
        text(
          'Four things on that list go nowhere at all: how often you use each phrase, the messages under the Sent tab, the translations under the Translations tab, and the day of questions kept for suggested answers. All four are a record of what you actually said or were asked, so all four stay on the device that recorded them — none is in a backup file, and none is in what Synchronize sends to your other devices. A factory reset clears them.',
        ),
      ],
    },
    {
      title: 'Listening',
      blocks: [
        text(
          "The microphone is off until you press :listen: on the message box. While it is on, Peri asks your browser to turn what the microphone hears into words, and shows them in a box of its own beside the message, with :mic: in that box's lower right corner for as long as sound is coming in. It only listens with an Anthropic key set up for suggested answers, since that is what the box is for.",
        ),
        text(
          "The listening is your browser's, not ours. Most browsers do it by sending the audio to a speech service of their own — the same one behind dictation elsewhere on your device — and what they do with it is governed by their privacy policy and your device maker's, not by this one. It does not pass through us and we never receive it. Your browser asks your permission the first time, and you can take it back in your browser at any point.",
        ),
        text(
          'What was heard is not kept. It lives in that box until you close it, and it is never in a backup file and never sent to your other devices.',
        ),
        text(
          'Questions you asked for answers to, and the answer you chose from them, are kept on this device for a day so that a conversation carries on making sense.',
        ),
        text(
          'So are the answers last offered, with the question they answered, so that they are still on the board if Peri is closed and opened again. Those are only ever shown to you: of the answers, only the ones you chose are ever sent anywhere.',
        ),
        text(
          'All of it is forgotten after a day, forgotten at once if you remove the key, and there is a button in the Settings row to forget it now. None of it is ever in a backup file or sent to your other devices.',
        ),
        text(
          'Suggested answers send the question to Anthropic, using an API key of your own that you set up under Settings. **With a key set up, this happens on its own**: when the person talking to you stops and your message box is empty, the question goes to be answered without your asking. Leave anything in the message box and it does not. The phrases on your board go with it — the ones Peri comes with and any you wrote yourself, with a name filled in where a phrase has only one to choose from — so that the answers can be your own words; how often you use each one does not. So do the day’s earlier questions and the answers you chose, described above. Nothing else about you goes with it, and nothing is sent by listening alone. What Anthropic does with it is governed by their policy, not this one. Saving the key sends it to Anthropic once, with nothing else, to check that it works. Once an answer has taken more than three seconds, Peri says a short apology out loud so that whoever is waiting is not left in silence; those are asked of Anthropic a few at a time, in a request that carries nothing of yours at all, and the apology itself is not kept as something you said. Remove the key, and nothing is ever sent there. The answers are only ever drawn on the board for you to read, choose between or ignore, and the one you choose goes into the message box to read, change or discard — Peri never speaks one for you.',
        ),
        text(
          'Where answering needs something looked up, Anthropic searches the web for it, so the question reaches a search provider as well. That happens only inside an answer, and only when the question needs it.',
        ),
      ],
    },
    {
      title: 'Synchronizing',
      blocks: [
        text(
          'Synchronize is off until you turn it on. While it is on, a copy of your board — your phrases, categories, word lists and settings, and your ElevenLabs and Anthropic keys if you have set them up — is kept on a server we run, so that the other devices you sign in to can fetch it.',
        ),
        text(
          'If you have linked an ElevenLabs account, the audio it makes is kept there too, one clip at a time and separately from the board. This is so that a phrase you have already paid to have spoken on one device is not paid for again on the next. Each clip is encrypted exactly as the board is, under an address worked out from the words and the voice, and nobody without your passphrase can work out either. Erasing the copy erases the audio with it.',
        ),
        text(
          'That copy is encrypted on your device before it is sent, using a key made from the passphrase you choose. We never receive the passphrase, and the key is never sent anywhere. We hold a block of bytes we cannot open, and neither can anyone who obtains it from us.',
        ),
        text('What we can see, and it is worth being exact about it:'),
        list(
          'That some board exists, stored under a 64-character address. The address is derived from your passphrase, so it is not your name, your email or your account — we cannot connect it to a person, and we cannot list one from the other.',
          'That some number of audio clips exist, each under an address of the same kind. An address tells us nothing about the words in the clip, and two people saying the same thing have two different addresses.',
          'When it was last written, and an eight-character label naming which of your own devices wrote it. Both are needed for your devices to tell whose copy is newer.',
          'How large it is, and the usual request information any web server records — see Hosting below.',
        ),
        text(
          'We cannot see a single phrase, category, contact, setting or key, and we cannot listen to a single clip. We cannot reset the passphrase, recover the board without it, or tell you whether you have typed it correctly. If you lose it, the copy on the server is lost with it — your devices keep their own boards, and you start again with a new passphrase.',
        ),
        text(
          'Turning the setting off stops the exchange and leaves the copy where it is. "Stop and erase the copy", in the same row, deletes it from the server — the board and every clip of audio with it. A factory reset removes the passphrase from this device but does not erase the copy — use the button first if you want both.',
        ),
      ],
    },
    {
      title: 'Signing in',
      blocks: [
        text(
          'Signing in with Google, Apple or Facebook is optional — the app works fully as a guest, and does exactly the same things either way. What differs is whose board it is: an account’s board opens for that account and no other, while every guest on a device shares one.',
        ),
        text(
          'If you do sign in, that provider gives us your name, email address, profile picture and the account number they use for you. We store them on your device to show in the menu and to know whose board to open, and we discard the access token immediately. We do not send any of it anywhere.',
        ),
        text(
          'The account number is used for two things. On your device, your board is kept under it, so that it opens for your account and nobody else’s. With Synchronize on, it is mixed into your passphrase to work out the address your encrypted board is stored under. It is never sent to us and never leaves your device — what leaves is the address, which cannot be turned back into it.',
        ),
        text(
          'Using a sign-in button means that provider knows you signed in to this app. What they do with that is governed by their own privacy policy, not this one.',
        ),
      ],
    },
    {
      title: 'Speech',
      blocks: [
        text(
          'Speech is produced by the voices built into your device or browser, through a standard web feature. The app does not record audio and has no access to your microphone.',
        ),
        text(
          'One caveat worth knowing: some operating systems offer higher-quality voices that run in the cloud rather than on the device. If you select one of those, your browser or operating system may send the text to be spoken to its own servers. That is between you, your browser and your device maker — it does not pass through us — but if it matters to you, choose a voice marked as on-device in your system settings.',
        ),
        text(
          'The same applies, deliberately and visibly, if you link an ElevenLabs account. Choosing one of its voices means that each phrase you speak is sent to ElevenLabs to be turned into audio, using your own account and your own credits. It goes from your device straight to them and does not pass through us. What they do with it is governed by their privacy policy, not this one. Unlink the account, or choose a device voice, and nothing is sent.',
        ),
        text(
          'The audio that comes back is kept on your device so the same phrase is never paid for twice. With Synchronize on it is also kept on our server, encrypted, so your own other devices need not pay for it either — see Synchronizing above for exactly what that means and how to erase it.',
        ),
        text(
          'Setting a spoken language works the same way, and mostly sends nothing. The phrases Peri comes with are translated before the app is built, so speaking one of those in another language involves no request at all. Only the phrases you wrote yourself, and messages you build out of several, need translating as you go. Those are sent from your device straight to Google, once each, using our account rather than yours, and the result is kept on your device so it is not sent again. We do not see them and we keep no copy. Set the language back to your device default and nothing is sent at all.',
        ),
        text(
          'The emergency bar always uses a device voice, whatever else is selected, so those phrases are spoken instantly and still work with no connection.',
        ),
      ],
    },
    {
      title: 'Hosting',
      blocks: [
        text(
          'The app is served by Netlify. Like any web host, their servers record standard request information such as IP addresses and browser type when a page is loaded. That is Netlify’s processing, under their privacy policy, and it happens whether or not you sign in.',
        ),
        text(
          'Once the app is installed or cached, it runs offline and makes no requests at all — except when you sign in, and when speaking through a linked ElevenLabs account.',
        ),
      ],
    },
    {
      title: 'Cookies and tracking',
      blocks: [
        text(
          'We set no cookies and use no tracking, advertising or analytics of any kind. The sign-in providers may set their own cookies as part of signing you in.',
        ),
      ],
    },
    {
      title: 'Deleting your information',
      blocks: [
        text(
          'Everything on your device goes when you clear this site’s data in your browser settings, or uninstall the app if you installed it to a home screen.',
        ),
        text(
          'If you turned on Synchronize, there is one thing that is not on your device: the encrypted copy. Erase it with "Stop and erase the copy" in the Settings row, which is instant and needs no request to us. There is nothing else on our side to delete — and because we cannot connect an address to a person, a request to us could not find it either.',
        ),
        text(
          'Signing out removes the account details from the device but leaves your board in place, for when you sign back in, and nobody else who signs in can open it. To take it off the device as well, use Reset to Factory Defaults in Settings before you sign out. That clears your board and nobody else’s.',
        ),
      ],
    },
    {
      title: 'Children',
      blocks: [
        text(
          'The app is suitable for users of any age and collects no information from anyone, so no age-based data handling applies.',
        ),
      ],
    },
    {
      title: 'Changes',
      blocks: [
        text(
          'If this policy changes, the date at the top changes with it. If we ever begin collecting anything at all, that will be stated here plainly and in advance rather than buried.',
        ),
      ],
    },
    {
      title: 'Contact',
      blocks: [text(`Questions about this policy: ${CONTACT}. The app is published by ${ENTITY}.`)],
    },
  ],
}

export const TERMS: ProseDocument = {
  title: 'Terms of Service',
  updated: TERMS_UPDATED,
  intro: 'Plain terms for a free, open-source app. Please read the section on emergencies.',
  sections: [
    {
      title: 'Not a medical device, and not an emergency service',
      blocks: [
        text(
          'Peri is a communication aid. It is not a medical device, it is not certified as one, and it is not monitored by anyone.',
        ),
        text(
          'The emergency phrases speak aloud through your device’s speaker. They do not call anyone, alert anyone, or reach any emergency service. Someone has to be within earshot for them to do anything at all.',
        ),
        text(
          'Do not rely on this app as your only way to summon help. Software crashes, batteries run down, browsers update and devices get left in another room. Anyone who depends on assistive communication should have a separate, non-digital means of calling for help.',
        ),
      ],
    },
    {
      title: 'Using the app',
      blocks: [
        text('The app is free to use, for any purpose, personal or professional.'),
        text('You are responsible for what you say with it, as you would be with any other way of speaking.'),
        text(
          'Do not use it to harass anyone, to impersonate anyone, or in any way that breaks the law where you are.',
        ),
      ],
    },
    {
      title: 'No warranty',
      blocks: [
        text(
          'The app is provided as is, without warranty of any kind. We do not promise that it will be available, that it will work on your device, that speech will sound the way you expect, or that your saved phrases will survive a browser update.',
        ),
        text(
          'Your phrases and settings are stored on your device. We cannot recover them if they are lost, and turning on Synchronize does not change that: the copy on our server is encrypted with a passphrase we do not hold, so we cannot open it, reset it, or restore it for you. Synchronize is a way to keep devices alike, not a backup service — save a backup file if your board matters, which it does.',
        ),
        text(
          'We do not promise that the synchronizing service will stay available, or that a copy stored on it will still be there tomorrow. Nothing on it is anything but a copy of what is already on your devices.',
        ),
      ],
    },
    {
      title: 'Limitation of liability',
      blocks: [
        text(
          `To the fullest extent permitted by law, ${ENTITY} is not liable for any loss or damage arising from your use of, or inability to use, this app. That includes anything that follows from a message not being spoken, being spoken wrongly, or being spoken at the wrong moment.`,
        ),
      ],
    },
    {
      title: 'Open source',
      blocks: [
        text(
          'Peri is released under the MIT Licence. You are free to use, copy, modify and distribute it, including commercially, provided the copyright notice and licence text are kept. The licence text is in the repository and governs the software itself; these terms govern your use of the version we publish.',
        ),
      ],
    },
    {
      title: 'Sign-in providers',
      blocks: [
        text(
          'If you sign in with Google, Apple or Facebook, your use of their service is governed by their terms, not ours. Signing in is optional and grants you no additional features here.',
        ),
      ],
    },
    {
      title: 'Changes',
      blocks: [
        text(
          'These terms may change; the date at the top will change with them. Continuing to use the app after a change means you accept the revised terms.',
        ),
      ],
    },
    {
      title: 'Contact',
      blocks: [text(`Questions about these terms: ${CONTACT}. The app is published by ${ENTITY}.`)],
    },
  ],
}

const LEGAL_ROUTES: Record<string, ProseDocument> = {
  '/privacy': PRIVACY,
  '/terms': TERMS,
}

/** Matches a pathname to a legal document, tolerating a trailing slash. */
export function legalDocumentFor(pathname: string): ProseDocument | null {
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/'
  return LEGAL_ROUTES[path] ?? null
}
