/**
 * Shell strings in English, German, French and Italian. The shell has no account yet, so the
 * language comes from the phone's settings. Add every key to all catalogues (their types enforce it).
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
  'welcome.demo.title': 'Have a look first',
  'welcome.demo.text': 'Try Hemmia with a made-up family: chats, pictures and the planner.',
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
  'legal.terms': 'Terms of Use',
  'legal.agreeBefore': 'By continuing you agree to the ',
  'legal.agreeAfter': '. How we handle data: ',
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
  'welcome.demo.title': 'Erst mal reinschauen',
  'welcome.demo.text': 'Probier Hemmia mit einer erfundenen Familie aus: Chats, Bilder und Planer.',
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
  'legal.agreeBefore': 'Wenn du fortfährst, stimmst du den ',
  'legal.agreeAfter': ' zu. Wie wir mit Daten umgehen: ',
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

export const fr: Record<ShellKey, string> = {
  'app.name': 'Hemmia',
  'welcome.title': 'Bienvenue dans Hemmia',
  'welcome.intro':
    'Ton IA, à la maison. Privée pour toi et ta famille, avec les modèles que tu choisis.',
  'welcome.scan.button': 'Scanner le code',
  'welcome.paste.label': 'Ou colle le lien',
  'welcome.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'welcome.paste.continue': 'Continuer',
  'welcome.getHub.button': 'Je n’ai pas encore Hemmia à la maison',
  'welcome.demo.title': 'Jeter un œil d’abord',
  'welcome.demo.text':
    'Essaie Hemmia avec une famille inventée : discussions, images et planificateur.',
  'getHub.title': 'Hemmia vit sur un ordinateur à la maison',
  'getHub.intro':
    'Installe le hub Hemmia sur un ordinateur qui reste allumé : un Mac avec puce Apple, ou un PC, un NAS ou un Raspberry Pi avec Docker. Tes discussions y sont stockées, chiffrées.',
  'getHub.step1': 'Sur l’ordinateur, télécharge Hemmia depuis le site Hemmia et installe le hub.',
  'getHub.step2': 'Suis la configuration. À la fin, elle affiche un code QR.',
  'getHub.step3': 'Reviens ici et scanne-le.',
  'getHub.sendLink.button': 'Envoyer le lien à mon ordinateur',
  'getHub.scan.button': 'Le hub est prêt : scanner le code QR',
  'scan.title': 'Scanner le code QR',
  'scan.intro':
    'Il est sur l’écran de ton hub Hemmia, ou sur le téléphone de la personne qui t’a invité.',
  'scan.paste.label': 'Ou colle plutôt un lien',
  'scan.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'scan.paste.continue': 'Continuer',
  'scan.back.button': '‹ Retour',
  'offline.title': '{name} est injoignable',
  'offline.checklist': 'Ce que tu peux vérifier',
  'offline.check1': 'L’ordinateur est-il allumé et éveillé ?',
  'offline.check2': 'A-t-il internet ?',
  'offline.lastReached': 'Joint pour la dernière fois depuis ce téléphone : {when}',
  'offline.tryAgain.button': 'Réessayer',
  'offline.switch.button': 'Passer à un autre hub',
  'hubList.title': 'Tes hubs',
  'hubList.phone': 'Sur ce téléphone',
  'hubList.phoneText': 'Ta propre clé, discussions seulement sur ce téléphone',
  'welcome.phone.title': 'Juste moi, sur ce téléphone',
  'welcome.phone.text':
    'Utilise ta propre clé OpenAI ou Anthropic. Tes discussions restent sur ce téléphone.',
  'open.connecting': 'Connexion…',
  'open.invalidLink': 'Ce n’est pas un lien Hemmia. Scanne à nouveau le code QR de ton hub.',
  'open.unreachable':
    'Le hub à cette adresse est injoignable pour le moment. Réessaie dans un instant.',
  'open.defaultName': 'Hemmia à la maison',
  'confirm.title': 'Ajouter ce hub ?',
  'confirm.text': 'Le lien que tu as ouvert mène à un hub Hemmia à cette adresse :',
  'confirm.tailnet': 'C’est une adresse Tailscale. Elle ne fonctionne que si Tailscale est activé.',
  'confirm.trust':
    'Ne continue que si le lien vient de quelqu’un en qui tu as confiance, comme la personne qui a installé Hemmia chez vous.',
  'confirm.add.button': 'Ajouter et ouvrir',
  'confirm.cancel.button': 'Annuler',
  'legal.privacy': 'Politique de confidentialité',
  'legal.terms': 'Conditions d’utilisation',
  'legal.agreeBefore': 'En continuant, tu acceptes les ',
  'legal.agreeAfter': '. Comment nous traitons les données : ',
  'getHub.shareText': 'Installer Hemmia sur cet ordinateur',
  'hubList.empty': 'Aucun hub enregistré sur ce téléphone pour l’instant.',
  ghost: 'Le fantôme Hemmia',
  'ghost.asleep': 'Le fantôme Hemmia, endormi',
  'hubList.add': 'Ajouter un autre hub',
  'hubList.remove': 'Retirer {name}',
  'outdated.app.title': 'Mets à jour l’app Hemmia',
  'outdated.app.text':
    '{name} a une version de Hemmia plus récente que ce que cette app prend en charge. Mets l’app à jour, puis rouvre {name}.',
  'outdated.app.button': 'Mettre l’app à jour',
  'outdated.hub.title': '{name} a besoin d’une mise à jour',
  'outdated.hub.text':
    'Cette app est plus récente que le Hemmia installé à la maison. La personne qui s’occupe de l’ordinateur Hemmia peut le mettre à jour (Réglages → Système, ou l’installateur).',
  'outdated.retry.button': 'Réessayer',
};

export const it: Record<ShellKey, string> = {
  'app.name': 'Hemmia',
  'welcome.title': 'Benvenuto in Hemmia',
  'welcome.intro': 'La tua IA, a casa. Privata per te e la tua famiglia, con i modelli che scegli.',
  'welcome.scan.button': 'Scansiona il codice',
  'welcome.paste.label': 'Oppure incolla il link',
  'welcome.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'welcome.paste.continue': 'Continua',
  'welcome.getHub.button': 'Non ho ancora Hemmia a casa',
  'welcome.demo.title': 'Dai prima un’occhiata',
  'welcome.demo.text': 'Prova Hemmia con una famiglia inventata: chat, immagini e agenda.',
  'getHub.title': 'Hemmia vive su un computer di casa',
  'getHub.intro':
    'Installa l’hub Hemmia su un computer che resta acceso: un Mac con chip Apple, oppure un PC, un NAS o un Raspberry Pi con Docker. Le tue chat vengono salvate lì, cifrate.',
  'getHub.step1': 'Sul computer, scarica Hemmia dal sito di Hemmia e installa l’hub.',
  'getHub.step2': 'Segui la configurazione. Alla fine mostra un codice QR.',
  'getHub.step3': 'Torna qui e scansionalo.',
  'getHub.sendLink.button': 'Invia il link al mio computer',
  'getHub.scan.button': 'L’hub è pronto: scansiona il codice QR',
  'scan.title': 'Scansiona il codice QR',
  'scan.intro': 'È sullo schermo del tuo hub Hemmia, o sul telefono di chi ti ha invitato.',
  'scan.paste.label': 'Oppure incolla un link',
  'scan.paste.placeholder': 'https://hub.example.com/j#1234567890',
  'scan.paste.continue': 'Continua',
  'scan.back.button': '‹ Indietro',
  'offline.title': '{name} non è raggiungibile',
  'offline.checklist': 'Cosa controllare',
  'offline.check1': 'Il computer è acceso e non in stop?',
  'offline.check2': 'Ha internet?',
  'offline.lastReached': 'Raggiunto l’ultima volta da questo telefono: {when}',
  'offline.tryAgain.button': 'Riprova',
  'offline.switch.button': 'Passa a un altro hub',
  'hubList.title': 'I tuoi hub',
  'hubList.phone': 'Su questo telefono',
  'hubList.phoneText': 'La tua chiave, chat solo su questo telefono',
  'welcome.phone.title': 'Solo io, su questo telefono',
  'welcome.phone.text':
    'Usa la tua chiave OpenAI o Anthropic. Le tue chat restano su questo telefono.',
  'open.connecting': 'Connessione…',
  'open.invalidLink':
    'Questo non è un link di Hemmia. Scansiona di nuovo il codice QR del tuo hub.',
  'open.unreachable': 'L’hub a questo indirizzo non è raggiungibile ora. Riprova tra un momento.',
  'open.defaultName': 'Hemmia a casa',
  'confirm.title': 'Aggiungere questo hub?',
  'confirm.text': 'Il link che hai aperto porta a un hub Hemmia a questo indirizzo:',
  'confirm.tailnet': 'Questo è un indirizzo Tailscale. Funziona solo quando Tailscale è attivo.',
  'confirm.trust':
    'Continua solo se il link viene da qualcuno di cui ti fidi, come chi ha configurato Hemmia a casa.',
  'confirm.add.button': 'Aggiungi e apri',
  'confirm.cancel.button': 'Annulla',
  'legal.privacy': 'Informativa sulla privacy',
  'legal.terms': 'Condizioni d’uso',
  'legal.agreeBefore': 'Continuando accetti le ',
  'legal.agreeAfter': '. Come trattiamo i dati: ',
  'getHub.shareText': 'Installa Hemmia su questo computer',
  'hubList.empty': 'Ancora nessun hub salvato su questo telefono.',
  ghost: 'Il fantasma di Hemmia',
  'ghost.asleep': 'Il fantasma di Hemmia, addormentato',
  'hubList.add': 'Aggiungi un altro hub',
  'hubList.remove': 'Rimuovi {name}',
  'outdated.app.title': 'Aggiorna l’app Hemmia',
  'outdated.app.text':
    '{name} ha una versione di Hemmia più recente di quella supportata da questa app. Aggiorna l’app, poi riapri {name}.',
  'outdated.app.button': 'Aggiorna l’app',
  'outdated.hub.title': '{name} ha bisogno di un aggiornamento',
  'outdated.hub.text':
    'Questa app è più recente dell’Hemmia installato a casa. Chi si occupa del computer di Hemmia può aggiornarlo lì (Impostazioni → Sistema, o il programma di installazione).',
  'outdated.retry.button': 'Riprova',
};

export type ShellLanguage = 'en' | 'de' | 'fr' | 'it';
const CATALOGUES: Record<ShellLanguage, Record<ShellKey, string>> = { en, de, fr, it };

export function phoneLanguage(languages: readonly string[]): ShellLanguage {
  const first = languages[0]?.toLowerCase().slice(0, 2) ?? '';
  return first === 'de' || first === 'fr' || first === 'it' ? first : 'en';
}

export type ShellT = (key: ShellKey, params?: Record<string, string>) => string;

export function translate(
  language: ShellLanguage,
  key: ShellKey,
  params?: Record<string, string>,
): string {
  const text: string = CATALOGUES[language][key];
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
