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

const UPDATED = '20 August 2026'
const CONTACT = 'spero@auli.tech'
const ENTITY = 'Autonomous Living Technologies, Inc.'

export const PRIVACY: ProseDocument = {
  title: 'Privacy Policy',
  updated: UPDATED,
  intro:
    'Peri is built for people who rely on it to say things they cannot otherwise say. That makes what happens to those words important. The short version: they stay on your device. Three things are exceptions, and each is yours to switch on: linking an ElevenLabs account sends the words you speak to ElevenLabs to be turned into audio, adding a translation key sends the phrases you wrote yourself to DeepL to be translated, and turning on Synchronize puts an encrypted copy of your board on our server so your other devices can fetch it. We cannot read that copy.',
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
          'Your ElevenLabs API key, if you linked an account, and your translation key if you added one.',
          'Your Synchronize passphrase, if you turned that on.',
        ),
        text(
          'None of this leaves your device unless you turn on Synchronize, and what leaves then is encrypted — see the next section. Neither your ElevenLabs key, your translation key, nor your Synchronize passphrase is included in a backup file, so sharing a backup does not share your accounts or your other devices. The passphrase never leaves your device at all; the other two travel between your own devices, inside the encryption, so the voices and translations you pay for work on all of them.',
        ),
      ],
    },
    {
      title: 'Synchronizing',
      blocks: [
        text(
          'Synchronize is off until you turn it on. While it is on, a copy of your board — your phrases, categories, word lists and settings, and your ElevenLabs key if you have linked an account — is kept on a server we run, so that the other devices you sign in to can fetch it.',
        ),
        text(
          'That copy is encrypted on your device before it is sent, using a key made from the passphrase you choose. We never receive the passphrase, and the key is never sent anywhere. We hold a block of bytes we cannot open, and neither can anyone who obtains it from us.',
        ),
        text('What we can see, and it is worth being exact about it:'),
        list(
          'That some board exists, stored under a 64-character address. The address is derived from your passphrase, so it is not your name, your email or your account — we cannot connect it to a person, and we cannot list one from the other.',
          'When it was last written, and an eight-character label naming which of your own devices wrote it. Both are needed for your devices to tell whose copy is newer.',
          'How large it is, and the usual request information any web server records — see Hosting below.',
        ),
        text(
          'We cannot see a single phrase, category, contact, setting or key. We cannot reset the passphrase, recover the board without it, or tell you whether you have typed it correctly. If you lose it, the copy on the server is lost with it — your devices keep their own boards, and you start again with a new passphrase.',
        ),
        text(
          'Turning the setting off stops the exchange and leaves the copy where it is. "Stop and erase the copy", in the same row, deletes it from the server. A factory reset removes the passphrase from this device but does not erase the copy — use the button first if you want both.',
        ),
      ],
    },
    {
      title: 'Signing in',
      blocks: [
        text(
          'Signing in with Google, Apple or Facebook is optional — the app works fully as a guest, and does exactly the same things either way.',
        ),
        text(
          'If you do sign in, that provider gives us your name, email address, profile picture and the account number they use for you. We store them on your device to show in the menu, and we discard the access token immediately. We do not send any of it anywhere.',
        ),
        text(
          'The account number is used for one thing: with Synchronize on, it is mixed into your passphrase to work out the address your encrypted board is stored under. It is never sent to us and never leaves your device — what leaves is the address, which cannot be turned back into it.',
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
        'Setting a spoken language works the same way, and mostly sends nothing. The phrases Peri comes with are translated before the app is built, so speaking one of those in another language involves no request at all. Only the phrases you wrote yourself, and messages you build out of several, need translating as you go — and only if you have added a translation key. Those are sent from your device straight to DeepL, once each, and the result is kept on your device so it is not sent again. Without a key nothing is sent and your own phrases are spoken as you wrote them.',
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
        text('Signing out removes the account details from the device but leaves your phrases and settings in place.'),
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
  updated: UPDATED,
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
