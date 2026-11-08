/**
 * The home page's words, in English and German (P10.10). Order and messages follow
 * MARKETING.md §2b; every claim follows the claims rules in MARKETING.md §1 (nothing about
 * "collecting nothing", no competitor names, no dated promises, "open source" only once the
 * repository is public).
 */
import type { Lang } from './content.ts';
import type { Pose } from './ghosts.tsx';

export interface HomeText {
  hero: {
    eyebrow: string;
    title: string;
    titleEm: string;
    lede: string;
    start: string;
    /** The second button (to the FAQ). */
    how: string;
    store: string;
    pills: string[];
    shotAlt: string;
  };
  asks: { title: string; intro: string; items: { pose: Pose; title: string; text: string }[] };
  ways: {
    title: string;
    intro: string;
    items: {
      tag: string;
      title: string;
      text: string;
      needs: string[];
      cost: string;
      shot: string;
      alt: string;
    }[];
  };
  family: { title: string; intro: string; points: string[]; shotAlt: string };
  compare: {
    title: string;
    intro: string;
    /** The first column's heading is for screen readers only. */
    head: [string, string, string];
    rows: [string, string, string][];
  };
  flow: { eyebrow: string; title: string; intro: string; steps: { title: string; text: string }[] };
  promises: { title: string; items: { pose: Pose; title: string; text: string }[] };
  cost: {
    title: string;
    intro: string;
    items: { title: string; price: string; note?: string; text: string }[];
  };
  faq: { title: string; items: { q: string; a: string }[]; more: string };
  next: { title: string; text: string };
  cta: { title: string; text: string; start: string };
}

export const HOME: Record<Lang, HomeText> = {
  en: {
    hero: {
      eyebrow: 'Free · iPhone app (beta) · Hemmia at home on a Mac or with Docker',
      title: 'Your AI,',
      titleEm: 'at home.',
      lede: 'Hemmia is a private AI for the whole family. It runs on a computer in your house, or simply on your phone, with the AI models you choose. Everyone gets their own account and their own chats.',
      start: 'Get started',
      how: 'Questions and answers',
      store: 'iPhone app coming soon',
      pills: [
        'No account with us',
        'No ads',
        'No tracking',
        'Chats stored on your devices',
        'Free with local models',
      ],
      shotAlt: 'Hemmia on a phone: a chat with the family hub',
    },
    asks: {
      title: 'What families ask Hemmia',
      intro: 'Everyday questions, from homework to dinner, for everyone in the house.',
      items: [
        {
          pose: 'book',
          title: 'Homework help',
          text: 'Explained step by step, at the level your child needs.',
        },
        {
          pose: 'pot',
          title: 'Dinner from the fridge',
          text: 'Take a photo of what’s there and get three ideas.',
        },
        {
          pose: 'glass',
          title: 'Letters, explained',
          text: 'Add a PDF from the tax office or the school and get it in plain words.',
        },
        {
          pose: 'sun',
          title: 'Plan your week',
          text: 'Weekly goals for school, work and home, and a short brief each morning.',
        },
        {
          pose: 'brush',
          title: 'Pictures',
          text: 'Describe a picture and Hemmia draws it, on a Mac at home.',
        },
      ],
    },
    ways: {
      title: 'Two ways to start',
      intro:
        'Start on your phone in two minutes, or set Hemmia up at home for the whole family. You can move from one to the other later.',
      items: [
        {
          tag: 'Two minutes',
          title: 'Just on your phone',
          text: 'Install the app, add your own key from Anthropic or OpenAI, and start chatting. Your chats and your key are stored on the phone.',
          needs: ['An iPhone', 'A key from Anthropic or OpenAI'],
          cost: 'You pay the provider for what you use, a few cents a day for most people. No markup.',
          shot: 'phone-chat',
          alt: 'Hemmia on a phone, chatting on its own',
        },
        {
          tag: 'For the whole family',
          title: 'At home',
          text: 'Hemmia runs on a computer in your house, the hub. It can use AI models that run on that computer, and everyone in the family gets their own account on every device.',
          needs: [
            'A Mac with Apple silicon, or any computer with Docker',
            'Phones and computers in the family',
          ],
          cost: 'Free. Models on the hub cost only electricity; cloud models are optional, with your own key.',
          shot: 'mac-setup-welcome',
          alt: 'Setting up Hemmia on a Mac',
        },
      ],
    },
    family: {
      title: 'Made for the whole family',
      intro: 'Hemmia is built around a household, not around one person at a desk.',
      points: [
        'Invite everyone with a QR code or a link.',
        'Everyone has their own private chats, locked with their own passphrase. Other family members can’t open them, and neither can the admin account.',
        'Teen accounts see only the models you allow, search the web with strict safe search (or not at all), and can’t create pictures.',
        'Notifications when an answer or a picture is ready.',
        'Your phones reach Hemmia at home and away with Hemmia Connect or Tailscale, without opening ports on your router.',
      ],
      shotAlt: 'The family settings with everyone’s accounts',
    },
    compare: {
      title: 'Hemmia and the usual AI apps',
      intro:
        'Most AI apps are built for one person and keep every conversation on their servers. Hemmia does it differently.',
      head: ['Topic', 'Many AI apps', 'Hemmia'],
      rows: [
        [
          'Where your chats are stored',
          'On the company’s servers',
          'On your hub or your phone, encrypted',
        ],
        [
          'Who can read them',
          'The company, under its own rules',
          'You. A cloud provider only for chats where you pick its model',
        ],
        ['Account needed', 'Yes, with email and often a phone number', 'No account with us'],
        ['Ads and tracking', 'Common', 'None'],
        [
          'A family of four',
          'A paid plan per person for the best models',
          'Free with local models, or one shared key',
        ],
        ['Choice of AI', 'The company’s own models', 'Local models, Anthropic or OpenAI'],
        [
          'Accounts for children',
          'Set up by the company, under its rules',
          'Teen accounts with limits you set',
        ],
      ],
    },
    flow: {
      eyebrow: 'No fine print',
      title: 'What actually goes where',
      intro:
        '“Private” is easy to claim. Here is exactly what happens when you ask Hemmia something.',
      steps: [
        { title: 'You write or add a photo.', text: 'On your phone, in the app or the browser.' },
        {
          title: 'It goes to your hub, or stays on your phone.',
          text: 'Through Hemmia Connect or Tailscale, encrypted all the way to your computer. Our relay passes it on but can’t read it.',
        },
        {
          title: 'The model you chose answers.',
          text: 'A model on your hub: nothing leaves the house. A cloud model: Hemmia asks first, then sends the chat to the provider with your own key.',
        },
        {
          title: 'The answer is stored on your device.',
          text: 'Encrypted on the hub with your passphrase, or on the phone with a key kept in its secure storage. Not on a server of ours.',
        },
      ],
    },
    promises: {
      title: 'Six promises',
      items: [
        {
          pose: 'house',
          title: 'Chats stored at home',
          text: 'On your own hub or phone, encrypted. With models on your hub, nothing leaves the house.',
        },
        {
          pose: 'key',
          title: 'Everyone has their own lock',
          text: 'Each person’s chats are locked with their own passphrase.',
        },
        {
          pose: 'wave',
          title: 'No account with us',
          text: 'You never sign up with us to use Hemmia.',
        },
        {
          pose: 'sleep',
          title: 'No ads, no tracking',
          text: 'No analytics in the apps or on this website.',
        },
        {
          pose: 'glass',
          title: 'Your choice of AI',
          text: 'Models on your own computer, or Anthropic and OpenAI with your key.',
        },
        {
          pose: 'book',
          title: 'Honest about limits',
          text: 'Local models are slower and less capable than the best cloud models. We say so.',
        },
      ],
    },
    cost: {
      title: 'What it costs',
      intro: 'Hemmia is free. You pay only for what you choose to add.',
      items: [
        {
          title: 'Hemmia',
          price: 'Free',
          text: 'The apps and the hub. Models on your hub cost only electricity.',
        },
        {
          title: 'Cloud models',
          price: 'At the provider’s prices',
          text: 'Optional, with your own key. A few cents a day for most people; set a spending limit at the provider. Hemmia also stops at a monthly limit per person.',
        },
        {
          title: 'Hemmia Connect',
          price: 'Free in the beta',
          note: 'then €29 a year per hub',
          text: 'Optional: your phones reach the hub with one switch, at home and away, up to 20 GB a month. Free during the beta, then 30 days free. Or set up Tailscale yourself, for free.',
        },
      ],
    },
    faq: {
      title: 'Questions',
      items: [
        {
          q: 'Do you see my chats?',
          a: 'No. They are stored on your hub or your phone, encrypted. When you choose a cloud model, Hemmia asks first and the chat goes to that provider with your own key.',
        },
        {
          q: 'What computer do I need for a hub?',
          a: 'A Mac with Apple silicon (M1 or newer, 16 GB of memory or more for good local models), or any computer that runs Docker. On your phone alone you need no computer at all.',
        },
        {
          q: 'How good are local models?',
          a: 'Good for everyday questions, homework, recipes and letters; slower and less capable than the best cloud models. You can use both and choose per chat.',
        },
        {
          q: 'Can my children use it?',
          a: 'Yes, with a teen account you create for them: they see only the models you allow and can’t create pictures. Their chats are private to them, like everyone else’s.',
        },
        {
          q: 'What happens if I lose my passphrase?',
          a: 'You get a recovery code when you create your account. With it you can set a new passphrase. Without it, nobody can open your chats again, not even an admin.',
        },
      ],
      more: 'All questions',
    },
    next: {
      title: 'Coming next',
      text: 'Planned, without dates: the Android app, and spaces the family shares.',
    },
    cta: {
      title: 'Bring a private AI home.',
      text: 'Hemmia is in beta. Hemmia at home will be free, as an installer for your Mac or with Docker; you use it in the browser and in the iPhone app, which is in testing now.',
      start: 'Get started',
    },
  },
  de: {
    hero: {
      eyebrow: 'Kostenlos · iPhone-App (Beta) · Hemmia zu Hause auf einem Mac oder mit Docker',
      title: 'Deine KI,',
      titleEm: 'zu Hause.',
      lede: 'Hemmia ist eine private KI für die ganze Familie. Sie läuft auf einem Computer bei dir zu Hause oder einfach auf deinem Telefon, mit den KI-Modellen, die du wählst. Alle bekommen ihr eigenes Konto und ihre eigenen Chats.',
      start: 'Loslegen',
      how: 'Fragen und Antworten',
      store: 'iPhone-App bald verfügbar',
      pills: [
        'Kein Konto bei uns',
        'Keine Werbung',
        'Kein Tracking',
        'Chats auf deinen Geräten',
        'Kostenlos mit lokalen Modellen',
      ],
      shotAlt: 'Hemmia auf einem Telefon: ein Chat mit dem Familien-Hub',
    },
    asks: {
      title: 'Was Familien Hemmia fragen',
      intro: 'Fragen aus dem Alltag, von den Hausaufgaben bis zum Abendessen, für alle im Haus.',
      items: [
        {
          pose: 'book',
          title: 'Hilfe bei den Hausaufgaben',
          text: 'Schritt für Schritt erklärt, so wie dein Kind es braucht.',
        },
        {
          pose: 'pot',
          title: 'Abendessen aus dem Kühlschrank',
          text: 'Fotografier, was da ist, und du bekommst drei Ideen.',
        },
        {
          pose: 'glass',
          title: 'Briefe, erklärt',
          text: 'Lade ein PDF vom Finanzamt oder von der Schule hoch und lass es dir in einfachen Worten erklären.',
        },
        {
          pose: 'sun',
          title: 'Deine Woche planen',
          text: 'Wochenziele für Schule, Arbeit und Zuhause und jeden Morgen ein kurzer Überblick.',
        },
        {
          pose: 'brush',
          title: 'Bilder',
          text: 'Beschreib ein Bild und Hemmia malt es, auf einem Mac zu Hause.',
        },
      ],
    },
    ways: {
      title: 'Zwei Wege zum Start',
      intro:
        'Starte in zwei Minuten auf dem Telefon oder richte Hemmia für die ganze Familie zu Hause ein. Du kannst später jederzeit wechseln.',
      items: [
        {
          tag: 'Zwei Minuten',
          title: 'Nur auf dem Telefon',
          text: 'Installier die App, füge deinen eigenen Schlüssel von Anthropic oder OpenAI ein und chatte los. Deine Chats und dein Schlüssel werden auf dem Telefon gespeichert.',
          needs: ['Ein iPhone', 'Ein Schlüssel von Anthropic oder OpenAI'],
          cost: 'Du zahlst den Anbieter für das, was du nutzt, für die meisten ein paar Cent am Tag. Ohne Aufschlag.',
          shot: 'phone-chat',
          alt: 'Hemmia allein auf dem iPhone, ohne Hub',
        },
        {
          tag: 'Für die ganze Familie',
          title: 'Zu Hause',
          text: 'Hemmia läuft auf einem Computer bei dir, dem Hub. Er kann KI-Modelle nutzen, die auf diesem Computer laufen, und alle in der Familie bekommen ihr eigenes Konto auf jedem Gerät.',
          needs: [
            'Ein Mac mit Apple-Chip oder ein Computer mit Docker',
            'Telefone und Computer der Familie',
          ],
          cost: 'Kostenlos. Modelle auf dem Hub kosten nur Strom; Cloud-Modelle sind optional, mit deinem eigenen Schlüssel.',
          shot: 'mac-setup-welcome',
          alt: 'Hemmia auf einem Mac einrichten',
        },
      ],
    },
    family: {
      title: 'Für die ganze Familie gemacht',
      intro: 'Hemmia ist für einen Haushalt gebaut, nicht für eine Person am Schreibtisch.',
      points: [
        'Lade alle mit einem QR-Code oder einem Link ein.',
        'Alle haben ihre eigenen privaten Chats, gesichert mit ihrer eigenen Passphrase. Andere in der Familie können sie nicht öffnen, auch nicht das Admin-Konto.',
        'Konten für Jugendliche sehen nur die Modelle, die du freigibst, suchen im Web mit strengem Jugendfilter (oder gar nicht) und erstellen keine Bilder.',
        'Mitteilungen, wenn eine Antwort oder ein Bild fertig ist.',
        'Eure Telefone erreichen Hemmia zu Hause und unterwegs mit Hemmia Connect oder Tailscale, ohne Ports am Router zu öffnen.',
      ],
      shotAlt: 'Die Familieneinstellungen mit den Konten aller',
    },
    compare: {
      title: 'Hemmia und die üblichen KI-Apps',
      intro:
        'Die meisten KI-Apps sind für eine Person gebaut und speichern jedes Gespräch auf ihren Servern. Hemmia macht es anders.',
      head: ['Thema', 'Viele KI-Apps', 'Hemmia'],
      rows: [
        [
          'Wo deine Chats liegen',
          'Auf den Servern der Firma',
          'Auf deinem Hub oder Telefon, verschlüsselt',
        ],
        [
          'Wer sie lesen kann',
          'Die Firma, nach ihren eigenen Regeln',
          'Du. Ein Cloud-Anbieter nur bei Chats, in denen du sein Modell wählst',
        ],
        ['Konto nötig', 'Ja, mit E-Mail und oft Telefonnummer', 'Kein Konto bei uns'],
        ['Werbung und Tracking', 'Verbreitet', 'Keine'],
        [
          'Eine vierköpfige Familie',
          'Ein Bezahl-Abo pro Person für die besten Modelle',
          'Kostenlos mit lokalen Modellen oder ein gemeinsamer Schlüssel',
        ],
        ['Welche KI', 'Die eigenen Modelle der Firma', 'Lokale Modelle, Anthropic oder OpenAI'],
        [
          'Konten für Kinder',
          'Von der Firma festgelegt, nach ihren Regeln',
          'Konten für Jugendliche mit deinen Grenzen',
        ],
      ],
    },
    flow: {
      eyebrow: 'Ohne Kleingedrucktes',
      title: 'Was wohin geht',
      intro:
        '„Privat“ ist schnell gesagt. Hier steht genau, was passiert, wenn du Hemmia etwas fragst.',
      steps: [
        {
          title: 'Du schreibst oder fügst ein Foto hinzu.',
          text: 'Auf deinem Telefon, in der App oder im Browser.',
        },
        {
          title: 'Es geht an deinen Hub oder bleibt auf dem Telefon.',
          text: 'Über Hemmia Connect oder Tailscale, verschlüsselt bis zu deinem Computer. Unser Relay leitet es weiter, kann es aber nicht lesen.',
        },
        {
          title: 'Das Modell, das du gewählt hast, antwortet.',
          text: 'Ein Modell auf deinem Hub: Nichts verlässt das Haus. Ein Cloud-Modell: Hemmia fragt vorher und schickt den Chat mit deinem eigenen Schlüssel an den Anbieter.',
        },
        {
          title: 'Die Antwort wird auf deinem Gerät gespeichert.',
          text: 'Verschlüsselt: auf dem Hub mit deiner Passphrase, auf dem Telefon mit einem Schlüssel aus dessen sicherem Speicher. Nicht auf einem Server von uns.',
        },
      ],
    },
    promises: {
      title: 'Sechs Versprechen',
      items: [
        {
          pose: 'house',
          title: 'Chats bleiben bei dir',
          text: 'Auf deinem eigenen Hub oder Telefon, verschlüsselt. Mit Modellen auf dem Hub verlässt nichts das Haus.',
        },
        {
          pose: 'key',
          title: 'Jede Person schließt selbst ab',
          text: 'Die Chats jeder Person sind mit ihrer eigenen Passphrase gesichert.',
        },
        {
          pose: 'wave',
          title: 'Kein Konto bei uns',
          text: 'Du meldest dich nie bei uns an, um Hemmia zu nutzen.',
        },
        {
          pose: 'sleep',
          title: 'Keine Werbung, kein Tracking',
          text: 'Keine Analyse in den Apps oder auf dieser Website.',
        },
        {
          pose: 'glass',
          title: 'Du wählst die KI',
          text: 'Modelle auf deinem eigenen Computer oder Anthropic und OpenAI mit deinem Schlüssel.',
        },
        {
          pose: 'book',
          title: 'Ehrlich über Grenzen',
          text: 'Lokale Modelle sind langsamer und weniger fähig als die besten Cloud-Modelle. Wir sagen das.',
        },
      ],
    },
    cost: {
      title: 'Was es kostet',
      intro: 'Hemmia ist kostenlos. Du zahlst nur für das, was du dazunimmst.',
      items: [
        {
          title: 'Hemmia',
          price: 'Kostenlos',
          text: 'Die Apps und der Hub. Modelle auf deinem Hub kosten nur Strom.',
        },
        {
          title: 'Cloud-Modelle',
          price: 'Zu den Preisen des Anbieters',
          text: 'Optional, mit deinem eigenen Schlüssel. Für die meisten ein paar Cent am Tag; leg beim Anbieter ein Ausgabenlimit fest. Hemmia hält außerdem bei einem Monatslimit pro Person an.',
        },
        {
          title: 'Hemmia Connect',
          price: 'Kostenlos in der Beta',
          note: 'danach 29 € im Jahr pro Hub',
          text: 'Optional: Deine Telefone erreichen den Hub mit einem Schalter, zu Hause und unterwegs, bis 20 GB im Monat. Während der Beta kostenlos, danach 30 Tage gratis. Oder richte Tailscale selbst ein, kostenlos.',
        },
      ],
    },
    faq: {
      title: 'Fragen',
      items: [
        {
          q: 'Seht ihr meine Chats?',
          a: 'Nein. Sie liegen auf deinem Hub oder Telefon, verschlüsselt. Wählst du ein Cloud-Modell, fragt Hemmia vorher, und der Chat geht mit deinem eigenen Schlüssel an diesen Anbieter.',
        },
        {
          q: 'Welchen Computer brauche ich für einen Hub?',
          a: 'Einen Mac mit Apple-Chip (M1 oder neuer, für gute lokale Modelle 16 GB Speicher oder mehr) oder einen Computer mit Docker. Nur auf dem Telefon brauchst du gar keinen Computer.',
        },
        {
          q: 'Wie gut sind lokale Modelle?',
          a: 'Gut für Alltagsfragen, Hausaufgaben, Rezepte und Briefe; langsamer und weniger fähig als die besten Cloud-Modelle. Du kannst beides nutzen und pro Chat wählen.',
        },
        {
          q: 'Können meine Kinder Hemmia nutzen?',
          a: 'Ja, mit einem Konto für Jugendliche, das du für sie anlegst: Sie sehen nur die Modelle, die du freigibst, und erstellen keine Bilder. Ihre Chats gehören ihnen, wie bei allen anderen.',
        },
        {
          q: 'Was passiert, wenn ich meine Passphrase verliere?',
          a: 'Beim Anlegen deines Kontos bekommst du einen Wiederherstellungscode. Damit setzt du eine neue Passphrase. Ohne ihn kann niemand deine Chats wieder öffnen, auch kein Admin.',
        },
      ],
      more: 'Alle Fragen',
    },
    next: {
      title: 'Als Nächstes',
      text: 'Geplant, ohne Termine: die Android-App und Bereiche, die die Familie teilt.',
    },
    cta: {
      title: 'Hol dir eine private KI nach Hause.',
      text: 'Hemmia ist in der Beta. Hemmia zu Hause wird kostenlos sein, als Installationspaket für deinen Mac oder mit Docker; du nutzt es im Browser und in der iPhone-App, die gerade getestet wird.',
      start: 'Loslegen',
    },
  },
};
