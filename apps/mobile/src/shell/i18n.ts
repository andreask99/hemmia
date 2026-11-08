/**
 * Shell strings in English and German. The shell has no account yet, so the language comes
 * from the phone's settings. Add every key to both catalogues (the `de` type enforces it).
 */
import { useMemo } from 'react';

export const en = {
  'app.name': 'Hemmia',
  'welcome.title': 'Welcome to Hemmia',
  'welcome.intro': 'Your AI, at home. Private for you and your family, with the models you choose.',
  'welcome.scan.button': 'Scan the code',
  'welcome.paste.label': 'Or paste the link',
  'welcome.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'welcome.paste.continue': 'Continue',
  'welcome.getHub.button': "I don't have Hemmia at home yet",
  'getHub.title': 'Hemmia lives on a computer at home',
  'getHub.intro':
    'Install the Hemmia hub on a computer that stays on: a Mac with Apple silicon, or a PC, NAS or Raspberry Pi with Docker. Your chats are stored there, encrypted.',
  'getHub.step1': 'On the computer, download Hemmia from the Hemmia website and install the hub.',
  'getHub.step2': 'Follow the setup. At the end it shows a QR code.',
  'getHub.step3': 'Come back here and scan it.',
  'getHub.sendLink.button': 'Send the link to my computer',
  'getHub.scan.button': 'The hub is ready: scan the QR code',
  'scan.title': 'Scan the QR code',
  'scan.intro': "It's on your Hemmia hub's screen, or on the phone of whoever invited you.",
  'scan.paste.label': 'Or paste a link instead',
  'scan.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'scan.paste.continue': 'Continue',
  'scan.back.button': '‹ Back',
  'offline.title': "{name} isn't reachable",
  'offline.checklist': 'What to check',
  'offline.check1': 'Is the computer switched on and awake?',
  'offline.check2': 'Does it have internet?',
  'offline.lastReached': 'Last reached from this phone: {when}',
  'offline.tryAgain.button': 'Try again',
  'offline.switch.button': 'Switch to another hub',
  'hubList.title': 'Your hubs',
  'hubList.phone': 'On this phone',
  'hubList.phoneText': 'Your own key, chats only on this phone',
  'welcome.phone.title': 'Just me, on this phone',
  'welcome.phone.text': 'Use your own OpenAI or Anthropic key. Your chats stay on this phone.',
  'open.connecting': 'Connecting…',
  'open.invalidLink': 'This isn’t a Hemmia link. Scan the QR code from your hub again.',
  'open.unreachable': 'The hub at this address isn’t reachable right now. Try again in a moment.',
  'open.defaultName': 'Hemmia at home',
  'confirm.title': 'Add this hub?',
  'confirm.text': 'The link you opened leads to a Hemmia hub at this address:',
  'confirm.tailnet': 'This is a Tailscale address. It works only while Tailscale is on.',
  'confirm.trust':
    'Only continue if the link comes from someone you trust, such as whoever set up Hemmia at home.',
  'confirm.add.button': 'Add and open',
  'confirm.cancel.button': 'Cancel',
  'legal.privacy': 'Privacy policy',
  'legal.terms': 'Terms of use',
  'getHub.shareText': 'Install Hemmia on this computer',
  'hubList.empty': 'No hub saved on this phone yet.',
  ghost: 'The Hemmia ghost',
  'ghost.asleep': 'The Hemmia ghost, asleep',
  'hubList.add': 'Add another hub',
  'hubList.remove': 'Remove {name}',
  'outdated.app.title': 'Please update the Hemmia app',
  'outdated.app.text':
    '{name} has a newer version of Hemmia than this app supports. Update the app, then open {name} again.',
  'outdated.app.button': 'Update the app',
  'outdated.hub.title': '{name} needs an update',
  'outdated.hub.text':
    'This app is newer than the Hemmia installed at home. Whoever looks after the Hemmia computer can update it there (Settings → System, or the installer).',
  'outdated.retry.button': 'Try again',
} as const;

export type ShellKey = keyof typeof en;
export const de: Record<ShellKey, string> = {
  'app.name': 'Hemmia',
  'welcome.title': 'Willkommen bei Hemmia',
  'welcome.intro':
    'Deine KI, zu Hause. Privat für dich und deine Familie, mit den Modellen deiner Wahl.',
  'welcome.scan.button': 'Code scannen',
  'welcome.paste.label': 'Oder Link einfügen',
  'welcome.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'welcome.paste.continue': 'Weiter',
  'welcome.getHub.button': 'Ich habe Hemmia noch nicht zu Hause',
  'getHub.title': 'Hemmia läuft auf einem Computer zu Hause',
  'getHub.intro':
    'Installiere den Hemmia-Hub auf einem Computer, der immer an ist: ein Mac mit Apple Silicon oder ein PC, NAS oder Raspberry Pi mit Docker. Deine Chats werden dort gespeichert und verschlüsselt.',
  'getHub.step1':
    'Lade Hemmia auf dem Computer von der Hemmia-Website herunter und installiere den Hub.',
  'getHub.step2': 'Folge der Einrichtung. Am Ende wird ein QR-Code angezeigt.',
  'getHub.step3': 'Kehre hierher zurück und scanne ihn.',
  'getHub.sendLink.button': 'Den Link an meinen Computer senden',
  'getHub.scan.button': 'Der Hub ist bereit: QR-Code scannen',
  'scan.title': 'QR-Code scannen',
  'scan.intro':
    'Du findest ihn auf dem Bildschirm deines Hemmia-Hubs oder auf dem Telefon der Person, die dich eingeladen hat.',
  'scan.paste.label': 'Oder einen Link einfügen',
  'scan.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'scan.paste.continue': 'Weiter',
  'scan.back.button': '‹ Zurück',
  'offline.title': '{name} ist nicht erreichbar',
  'offline.checklist': 'Was du prüfen kannst',
  'offline.check1': 'Ist der Computer eingeschaltet und wach?',
  'offline.check2': 'Hat er Internet?',
  'offline.lastReached': 'Zuletzt von diesem Telefon erreicht: {when}',
  'offline.tryAgain.button': 'Erneut versuchen',
  'offline.switch.button': 'Zu einem anderen Hub wechseln',
  'hubList.title': 'Deine Hubs',
  'hubList.phone': 'Auf diesem Telefon',
  'hubList.phoneText': 'Dein eigener Schlüssel, Chats nur auf diesem Telefon',
  'welcome.phone.title': 'Nur ich, auf diesem Telefon',
  'welcome.phone.text':
    'Nutze deinen eigenen OpenAI- oder Anthropic-Schlüssel. Deine Chats bleiben auf diesem Telefon.',
  'open.connecting': 'Verbinde…',
  'open.invalidLink': 'Das ist kein Hemmia-Link. Scanne den QR-Code deines Hubs noch einmal.',
  'open.unreachable':
    'Der Hub unter dieser Adresse ist gerade nicht erreichbar. Versuch es gleich noch einmal.',
  'open.defaultName': 'Hemmia zu Hause',
  'confirm.title': 'Diesen Hub hinzufügen?',
  'confirm.text': 'Der geöffnete Link führt zu einem Hemmia-Hub mit dieser Adresse:',
  'confirm.tailnet':
    'Das ist eine Tailscale-Adresse. Sie funktioniert nur, wenn Tailscale eingeschaltet ist.',
  'confirm.trust':
    'Mach nur weiter, wenn der Link von jemandem kommt, dem du vertraust, zum Beispiel von der Person, die Hemmia bei euch eingerichtet hat.',
  'confirm.add.button': 'Hinzufügen und öffnen',
  'confirm.cancel.button': 'Abbrechen',
  'legal.privacy': 'Datenschutzerklärung',
  'legal.terms': 'Nutzungsbedingungen',
  'getHub.shareText': 'Hemmia auf diesem Computer installieren',
  'hubList.empty': 'Auf diesem Telefon ist noch kein Hub gespeichert.',
  ghost: 'Das Hemmia-Gespenst',
  'ghost.asleep': 'Das Hemmia-Gespenst schläft',
  'hubList.add': 'Weiteren Hub hinzufügen',
  'hubList.remove': '{name} entfernen',
  'outdated.app.title': 'Bitte aktualisiere die Hemmia-App',
  'outdated.app.text':
    '{name} hat eine neuere Hemmia-Version, als diese App unterstützt. Aktualisiere die App und öffne {name} dann erneut.',
  'outdated.app.button': 'App aktualisieren',
  'outdated.hub.title': '{name} braucht ein Update',
  'outdated.hub.text':
    'Diese App ist neuer als das Hemmia zu Hause. Wer den Hemmia-Computer betreut, kann es dort aktualisieren (Einstellungen → System oder mit dem Installationsprogramm).',
  'outdated.retry.button': 'Erneut versuchen',
};

export type ShellLanguage = 'en' | 'de';

export function phoneLanguage(languages: readonly string[]): ShellLanguage {
  return languages[0]?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export type ShellT = (key: ShellKey, params?: Record<string, string>) => string;

export function translate(
  language: ShellLanguage,
  key: ShellKey,
  params?: Record<string, string>,
): string {
  const text: string = (language === 'de' ? de : en)[key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => params[name] ?? m) : text;
}

/** `t` for the phone's language; tests pass a language explicitly. */
export function useShellText(language?: ShellLanguage): { t: ShellT; language: ShellLanguage } {
  const lang = language ?? phoneLanguage(navigator.languages);
  return useMemo(
    () => ({ language: lang, t: (key, params) => translate(lang, key, params) }),
    [lang],
  );
}
