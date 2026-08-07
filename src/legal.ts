// Privacy policy and terms of service, served at /privacy and /terms.
//
// These describe what the app actually does today: everything is stored on the
// device and nothing is sent to a server we run, because there is no server we
// run. If that ever changes — a sync backend, analytics, crash reporting — this
// file has to change in the same commit, or it becomes a false claim.
//
// Not written by a lawyer. Accurate, but worth review before it is relied on.

import { type ProseDocument, list, text } from './prose'

const UPDATED = '6 August 2026'
const CONTACT = 'spero@auli.tech'
const ENTITY = 'Autonomous Living Technologies, Inc.'

export const PRIVACY: ProseDocument = {
  title: 'Privacy Policy',
  updated: UPDATED,
  intro:
    'DwellSpeak is built for people who rely on it to say things they cannot otherwise say. That makes what happens to those words important. The short version: they stay on your device.',
  sections: [
    {
      title: 'What we collect',
      blocks: [
        text(
          'Nothing. We operate no servers, no database and no analytics, so there is nowhere for your information to be sent.',
        ),
        text('Everything the app remembers is stored in your browser, on your device:'),
        list(
          'The phrases you add, edit or hide.',
          'Your settings — dwell times, voice, volume and speed.',
          'Your details — your name and the contacts you enter.',
          'Which account you last signed in with, if any.',
        ),
        text(
          'This information never leaves your device. We cannot see it, and we could not retrieve it for you if you lost it.',
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
          'If you do sign in, that provider gives us your name, email address and profile picture. We store them on your device to show in the menu, and we discard the access token immediately. We do not send them anywhere, and we do not use them to identify you across devices.',
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
      ],
    },
    {
      title: 'Hosting',
      blocks: [
        text(
          'The app is served by Netlify. Like any web host, their servers record standard request information such as IP addresses and browser type when a page is loaded. That is Netlify’s processing, under their privacy policy, and it happens whether or not you sign in.',
        ),
        text(
          'Once the app is installed or cached, it runs offline and makes no requests at all except when you sign in.',
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
          'Because everything is on your device, you remove it by clearing this site’s data in your browser settings, or by uninstalling the app if you installed it to a home screen. There is nothing on our side to delete, and no request you need to send us.',
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
          'DwellSpeak is a communication aid. It is not a medical device, it is not certified as one, and it is not monitored by anyone.',
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
          'Because everything is stored on your device and nowhere else, we cannot recover your phrases or settings if they are lost. If they matter, write them down somewhere else too.',
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
          'DwellSpeak is released under the MIT Licence. You are free to use, copy, modify and distribute it, including commercially, provided the copyright notice and licence text are kept. The licence text is in the repository and governs the software itself; these terms govern your use of the version we publish.',
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

export const LEGAL_ROUTES: Record<string, ProseDocument> = {
  '/privacy': PRIVACY,
  '/terms': TERMS,
}

/** Matches a pathname to a legal document, tolerating a trailing slash. */
export function legalDocumentFor(pathname: string): ProseDocument | null {
  const path = pathname.replace(/\/+$/, '').toLowerCase() || '/'
  return LEGAL_ROUTES[path] ?? null
}
