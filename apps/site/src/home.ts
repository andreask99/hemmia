/**
 * The home page's words, in English, German, French and Italian (P10.10). Order and messages follow
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
    demo: string;
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
      demo: 'Try the demo',
      store: 'iPhone app coming soon',
      pills: [
        'No account with us',
        'No ads',
        'No tracking',
        'Open source',
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
          pose: 'house',
          title: 'Recipe to shopping list',
          text: 'Any recipe, from any country, on one list the whole family shares: amounts in your units, the usual packs, and what you have at home already ticked off. With Hemmia at home.',
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
      text: 'Hemmia is in beta. Hemmia at home is free, as an installer for your Mac or with Docker; you use it in the browser and in the iPhone app, which is in testing now.',
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
      demo: 'Demo ansehen',
      store: 'iPhone-App bald verfügbar',
      pills: [
        'Kein Konto bei uns',
        'Keine Werbung',
        'Kein Tracking',
        'Open Source',
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
          pose: 'house',
          title: 'Vom Rezept zur Einkaufsliste',
          text: 'Jedes Rezept, aus jedem Land, auf einer Liste für die ganze Familie: Mengen in deinen Einheiten, die üblichen Packungen, und was du zu Hause hast, ist schon abgehakt. Mit Hemmia zu Hause.',
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
      text: 'Hemmia ist in der Beta. Hemmia zu Hause ist kostenlos, als Installationspaket für deinen Mac oder mit Docker; du nutzt es im Browser und in der iPhone-App, die gerade getestet wird.',
      start: 'Loslegen',
    },
  },
  fr: {
    hero: {
      eyebrow: 'Gratuit · App iPhone (bêta) · Hemmia à la maison sur un Mac ou avec Docker',
      title: 'Ton IA,',
      titleEm: 'à la maison.',
      lede: 'Hemmia est une IA privée pour toute la famille. Elle tourne sur un ordinateur chez toi, ou tout simplement sur ton téléphone, avec les modèles d’IA que tu choisis. Chacun a son propre compte et ses propres discussions.',
      start: 'Commencer',
      how: 'Questions et réponses',
      demo: 'Essayer la démo',
      store: 'App iPhone bientôt disponible',
      pills: [
        'Pas de compte chez nous',
        'Pas de publicité',
        'Pas de pistage',
        'Open source',
        'Discussions stockées sur tes appareils',
        'Gratuit avec les modèles locaux',
      ],
      shotAlt: 'Hemmia sur un téléphone : une discussion avec le hub familial',
    },
    asks: {
      title: 'Ce que les familles demandent à Hemmia',
      intro: 'Des questions du quotidien, des devoirs au dîner, pour toute la maison.',
      items: [
        {
          pose: 'book',
          title: 'Aide aux devoirs',
          text: 'Expliqué pas à pas, au niveau dont ton enfant a besoin.',
        },
        {
          pose: 'pot',
          title: 'Le dîner avec ce qu’il y a dans le frigo',
          text: 'Prends une photo de ce qu’il y a et reçois trois idées.',
        },
        {
          pose: 'house',
          title: 'De la recette à la liste de courses',
          text: 'N’importe quelle recette, de n’importe quel pays, sur une liste que toute la famille partage : les quantités dans tes unités, les emballages habituels, et ce que tu as déjà est coché. Avec Hemmia à la maison.',
        },
        {
          pose: 'glass',
          title: 'Des lettres expliquées',
          text: 'Ajoute un PDF des impôts ou de l’école et reçois-le en mots simples.',
        },
        {
          pose: 'sun',
          title: 'Planifier ta semaine',
          text: 'Des objectifs hebdomadaires pour l’école, le travail et la maison, et un court aperçu chaque matin.',
        },
        {
          pose: 'brush',
          title: 'Des images',
          text: 'Décris une image et Hemmia la dessine, sur un Mac à la maison.',
        },
      ],
    },
    ways: {
      title: 'Deux façons de commencer',
      intro:
        'Commence sur ton téléphone en deux minutes, ou installe Hemmia à la maison pour toute la famille. Tu pourras passer de l’un à l’autre plus tard.',
      items: [
        {
          tag: 'Deux minutes',
          title: 'Juste sur ton téléphone',
          text: 'Installe l’app, ajoute ta propre clé d’Anthropic ou d’OpenAI et commence à discuter. Tes discussions et ta clé sont stockées sur le téléphone.',
          needs: ['Un iPhone', 'Une clé d’Anthropic ou d’OpenAI'],
          cost: 'Tu paies le fournisseur pour ce que tu utilises, quelques centimes par jour pour la plupart des gens. Sans marge.',
          shot: 'phone-chat',
          alt: 'Hemmia sur un téléphone, en discussion tout seul',
        },
        {
          tag: 'Pour toute la famille',
          title: 'À la maison',
          text: 'Hemmia tourne sur un ordinateur chez toi, le hub. Il peut utiliser des modèles d’IA qui tournent sur cet ordinateur, et chacun dans la famille a son propre compte sur tous ses appareils.',
          needs: [
            'Un Mac avec puce Apple, ou n’importe quel ordinateur avec Docker',
            'Les téléphones et ordinateurs de la famille',
          ],
          cost: 'Gratuit. Les modèles sur le hub ne coûtent que l’électricité ; les modèles cloud sont facultatifs, avec ta propre clé.',
          shot: 'mac-setup-welcome',
          alt: 'Configuration de Hemmia sur un Mac',
        },
      ],
    },
    family: {
      title: 'Fait pour toute la famille',
      intro: 'Hemmia est pensé pour un foyer, pas pour une seule personne derrière un bureau.',
      points: [
        'Invite tout le monde avec un code QR ou un lien.',
        'Chacun a ses propres discussions privées, verrouillées par sa propre phrase de passe. Les autres membres de la famille ne peuvent pas les ouvrir, le compte admin non plus.',
        'Les comptes ados ne voient que les modèles que tu autorises, cherchent sur le web avec un SafeSearch strict (ou pas du tout) et ne peuvent pas créer d’images.',
        'Des notifications quand une réponse ou une image est prête.',
        'Tes téléphones joignent Hemmia à la maison et en déplacement avec Hemmia Connect ou Tailscale, sans ouvrir de ports sur ton routeur.',
      ],
      shotAlt: 'Les réglages de la famille avec les comptes de chacun',
    },
    compare: {
      title: 'Hemmia et les apps d’IA habituelles',
      intro:
        'La plupart des apps d’IA sont faites pour une seule personne et gardent chaque conversation sur leurs serveurs. Hemmia fait autrement.',
      head: ['Sujet', 'Beaucoup d’apps d’IA', 'Hemmia'],
      rows: [
        [
          'Où tes discussions sont stockées',
          'Sur les serveurs de l’entreprise',
          'Sur ton hub ou ton téléphone, chiffrées',
        ],
        [
          'Qui peut les lire',
          'L’entreprise, selon ses propres règles',
          'Toi. Un fournisseur cloud seulement pour les discussions où tu choisis son modèle',
        ],
        [
          'Compte nécessaire',
          'Oui, avec un e-mail et souvent un numéro de téléphone',
          'Pas de compte chez nous',
        ],
        ['Publicité et pistage', 'Courants', 'Aucun'],
        [
          'Une famille de quatre',
          'Un abonnement payant par personne pour les meilleurs modèles',
          'Gratuit avec les modèles locaux, ou une seule clé partagée',
        ],
        ['Choix de l’IA', 'Les modèles de l’entreprise', 'Modèles locaux, Anthropic ou OpenAI'],
        [
          'Comptes pour les enfants',
          'Gérés par l’entreprise, selon ses règles',
          'Comptes ados avec les limites que tu fixes',
        ],
      ],
    },
    flow: {
      eyebrow: 'Sans petits caractères',
      title: 'Ce qui va vraiment où',
      intro:
        '« Privé », c’est facile à dire. Voici exactement ce qui se passe quand tu demandes quelque chose à Hemmia.',
      steps: [
        {
          title: 'Tu écris ou ajoutes une photo.',
          text: 'Sur ton téléphone, dans l’app ou le navigateur.',
        },
        {
          title: 'Ça va à ton hub, ou ça reste sur ton téléphone.',
          text: 'Par Hemmia Connect ou Tailscale, chiffré jusqu’à ton ordinateur. Notre relais le transmet mais ne peut pas le lire.',
        },
        {
          title: 'Le modèle que tu as choisi répond.',
          text: 'Un modèle sur ton hub : rien ne quitte la maison. Un modèle cloud : Hemmia demande d’abord, puis envoie la discussion au fournisseur avec ta propre clé.',
        },
        {
          title: 'La réponse est stockée sur ton appareil.',
          text: 'Chiffrée sur le hub avec ta phrase de passe, ou sur le téléphone avec une clé gardée dans son stockage sécurisé. Pas sur un serveur à nous.',
        },
      ],
    },
    promises: {
      title: 'Six promesses',
      items: [
        {
          pose: 'house',
          title: 'Discussions stockées à la maison',
          text: 'Sur ton propre hub ou téléphone, chiffrées. Avec les modèles de ton hub, rien ne quitte la maison.',
        },
        {
          pose: 'key',
          title: 'Chacun a son propre verrou',
          text: 'Les discussions de chacun sont verrouillées par sa propre phrase de passe.',
        },
        {
          pose: 'wave',
          title: 'Pas de compte chez nous',
          text: 'Tu n’as jamais besoin de t’inscrire chez nous pour utiliser Hemmia.',
        },
        {
          pose: 'sleep',
          title: 'Pas de publicité, pas de pistage',
          text: 'Pas de statistiques d’audience dans les apps ni sur ce site.',
        },
        {
          pose: 'glass',
          title: 'Ton choix d’IA',
          text: 'Des modèles sur ton propre ordinateur, ou Anthropic et OpenAI avec ta clé.',
        },
        {
          pose: 'book',
          title: 'Honnête sur les limites',
          text: 'Les modèles locaux sont plus lents et moins capables que les meilleurs modèles cloud. Nous le disons.',
        },
      ],
    },
    cost: {
      title: 'Ce que ça coûte',
      intro: 'Hemmia est gratuit. Tu ne paies que ce que tu choisis d’ajouter.',
      items: [
        {
          title: 'Hemmia',
          price: 'Gratuit',
          text: 'Les apps et le hub. Les modèles sur ton hub ne coûtent que l’électricité.',
        },
        {
          title: 'Modèles cloud',
          price: 'Aux prix du fournisseur',
          text: 'Facultatifs, avec ta propre clé. Quelques centimes par jour pour la plupart des gens ; fixe une limite de dépenses chez le fournisseur. Hemmia s’arrête aussi à une limite mensuelle par personne.',
        },
        {
          title: 'Hemmia Connect',
          price: 'Gratuit pendant la bêta',
          note: 'puis 29 € par an et par hub',
          text: 'Facultatif : tes téléphones joignent le hub d’un simple bouton, à la maison et en déplacement, jusqu’à 20 Go par mois. Gratuit pendant la bêta, puis 30 jours offerts. Ou installe toi-même Tailscale, gratuitement.',
        },
      ],
    },
    faq: {
      title: 'Questions',
      items: [
        {
          q: 'Vous voyez mes discussions ?',
          a: 'Non. Elles sont stockées sur ton hub ou ton téléphone, chiffrées. Quand tu choisis un modèle cloud, Hemmia demande d’abord et la discussion part chez ce fournisseur avec ta propre clé.',
        },
        {
          q: 'De quel ordinateur ai-je besoin pour un hub ?',
          a: 'Un Mac avec puce Apple (M1 ou plus récent, 16 Go de mémoire ou plus pour de bons modèles locaux), ou n’importe quel ordinateur qui fait tourner Docker. Sur ton téléphone seul, tu n’as besoin d’aucun ordinateur.',
        },
        {
          q: 'Les modèles locaux sont-ils bons ?',
          a: 'Bons pour les questions du quotidien, les devoirs, les recettes et les lettres ; plus lents et moins capables que les meilleurs modèles cloud. Tu peux utiliser les deux et choisir pour chaque discussion.',
        },
        {
          q: 'Mes enfants peuvent-ils l’utiliser ?',
          a: 'Oui, avec un compte ado que tu crées pour eux : ils ne voient que les modèles que tu autorises et ne peuvent pas créer d’images. Leurs discussions sont privées, comme celles de tout le monde.',
        },
        {
          q: 'Que se passe-t-il si je perds ma phrase de passe ?',
          a: 'Tu reçois un code de récupération en créant ton compte. Avec lui, tu peux définir une nouvelle phrase de passe. Sans lui, personne ne peut plus ouvrir tes discussions, pas même un admin.',
        },
      ],
      more: 'Toutes les questions',
    },
    next: {
      title: 'Prochainement',
      text: 'Prévu, sans dates : l’app Android, et des espaces partagés par la famille.',
    },
    cta: {
      title: 'Une IA privée à la maison.',
      text: 'Hemmia est en bêta. Hemmia à la maison est gratuit, avec un installateur pour ton Mac ou avec Docker ; tu l’utilises dans le navigateur et dans l’app iPhone, actuellement en test.',
      start: 'Commencer',
    },
  },
  it: {
    hero: {
      eyebrow: 'Gratis · App per iPhone (beta) · Hemmia a casa su un Mac o con Docker',
      title: 'La tua IA,',
      titleEm: 'a casa.',
      lede: 'Hemmia è un’IA privata per tutta la famiglia. Gira su un computer di casa tua, o semplicemente sul tuo telefono, con i modelli di IA che scegli. Ognuno ha il proprio account e le proprie chat.',
      start: 'Inizia',
      how: 'Domande e risposte',
      demo: 'Prova la demo',
      store: 'App per iPhone in arrivo',
      pills: [
        'Nessun account da noi',
        'Niente pubblicità',
        'Nessun tracciamento',
        'Open source',
        'Chat salvate sui tuoi dispositivi',
        'Gratis con i modelli locali',
      ],
      shotAlt: 'Hemmia su un telefono: una chat con l’hub di famiglia',
    },
    asks: {
      title: 'Cosa chiedono le famiglie a Hemmia',
      intro: 'Domande di tutti i giorni, dai compiti alla cena, per tutti in casa.',
      items: [
        {
          pose: 'book',
          title: 'Aiuto con i compiti',
          text: 'Spiegato passo per passo, al livello di cui tuo figlio ha bisogno.',
        },
        {
          pose: 'pot',
          title: 'La cena con quello che c’è in frigo',
          text: 'Fai una foto di quello che c’è e ricevi tre idee.',
        },
        {
          pose: 'house',
          title: 'Dalla ricetta alla lista della spesa',
          text: 'Qualsiasi ricetta, da qualsiasi paese, in una lista che tutta la famiglia condivide: quantità nelle tue unità, le confezioni solite, e ciò che hai già in casa è spuntato. Con Hemmia a casa.',
        },
        {
          pose: 'glass',
          title: 'Lettere spiegate',
          text: 'Aggiungi un PDF del fisco o della scuola e ricevilo in parole semplici.',
        },
        {
          pose: 'sun',
          title: 'Pianifica la settimana',
          text: 'Obiettivi settimanali per la scuola, il lavoro e la casa, e un breve riepilogo ogni mattina.',
        },
        {
          pose: 'brush',
          title: 'Immagini',
          text: 'Descrivi un’immagine e Hemmia la disegna, su un Mac a casa.',
        },
      ],
    },
    ways: {
      title: 'Due modi per iniziare',
      intro:
        'Inizia sul telefono in due minuti, o configura Hemmia a casa per tutta la famiglia. Più tardi puoi passare dall’uno all’altro.',
      items: [
        {
          tag: 'Due minuti',
          title: 'Solo sul telefono',
          text: 'Installa l’app, aggiungi la tua chiave di Anthropic o OpenAI e inizia a chattare. Le tue chat e la tua chiave restano sul telefono.',
          needs: ['Un iPhone', 'Una chiave di Anthropic o OpenAI'],
          cost: 'Paghi il fornitore per ciò che usi, pochi centesimi al giorno per la maggior parte delle persone. Senza ricarichi.',
          shot: 'phone-chat',
          alt: 'Hemmia su un telefono, che chatta da solo',
        },
        {
          tag: 'Per tutta la famiglia',
          title: 'A casa',
          text: 'Hemmia gira su un computer di casa tua, l’hub. Può usare modelli di IA che girano su quel computer, e ognuno in famiglia ha il proprio account su ogni dispositivo.',
          needs: [
            'Un Mac con chip Apple, o qualsiasi computer con Docker',
            'I telefoni e i computer della famiglia',
          ],
          cost: 'Gratis. I modelli sull’hub costano solo l’elettricità; i modelli cloud sono facoltativi, con la tua chiave.',
          shot: 'mac-setup-welcome',
          alt: 'Configurazione di Hemmia su un Mac',
        },
      ],
    },
    family: {
      title: 'Fatto per tutta la famiglia',
      intro: 'Hemmia è pensato per una casa, non per una sola persona alla scrivania.',
      points: [
        'Invita tutti con un codice QR o un link.',
        'Ognuno ha le proprie chat private, chiuse con la propria passphrase. Gli altri in famiglia non possono aprirle, e nemmeno l’account admin.',
        'Gli account per ragazzi vedono solo i modelli che consenti, cercano sul web con SafeSearch rigoroso (o per niente) e non possono creare immagini.',
        'Notifiche quando una risposta o un’immagine è pronta.',
        'I tuoi telefoni raggiungono Hemmia a casa e fuori con Hemmia Connect o Tailscale, senza aprire porte sul router.',
      ],
      shotAlt: 'Le impostazioni della famiglia con gli account di tutti',
    },
    compare: {
      title: 'Hemmia e le solite app di IA',
      intro:
        'La maggior parte delle app di IA è fatta per una sola persona e conserva ogni conversazione sui propri server. Hemmia fa diversamente.',
      head: ['Tema', 'Molte app di IA', 'Hemmia'],
      rows: [
        [
          'Dove sono salvate le tue chat',
          'Sui server dell’azienda',
          'Sul tuo hub o sul tuo telefono, cifrate',
        ],
        [
          'Chi può leggerle',
          'L’azienda, secondo le sue regole',
          'Tu. Un fornitore cloud solo per le chat in cui scegli il suo modello',
        ],
        [
          'Account necessario',
          'Sì, con e-mail e spesso un numero di telefono',
          'Nessun account da noi',
        ],
        ['Pubblicità e tracciamento', 'Comuni', 'Nessuno'],
        [
          'Una famiglia di quattro',
          'Un abbonamento a pagamento a persona per i modelli migliori',
          'Gratis con i modelli locali, o una sola chiave condivisa',
        ],
        ['Scelta dell’IA', 'I modelli dell’azienda', 'Modelli locali, Anthropic o OpenAI'],
        [
          'Account per i bambini',
          'Gestiti dall’azienda, secondo le sue regole',
          'Account per ragazzi con i limiti che imposti tu',
        ],
      ],
    },
    flow: {
      eyebrow: 'Niente clausole in piccolo',
      title: 'Cosa va davvero dove',
      intro:
        '«Privato» è facile da dire. Ecco esattamente cosa succede quando chiedi qualcosa a Hemmia.',
      steps: [
        {
          title: 'Scrivi o aggiungi una foto.',
          text: 'Sul telefono, nell’app o nel browser.',
        },
        {
          title: 'Va al tuo hub, o resta sul telefono.',
          text: 'Tramite Hemmia Connect o Tailscale, cifrato fino al tuo computer. Il nostro relay lo inoltra ma non può leggerlo.',
        },
        {
          title: 'Risponde il modello che hai scelto.',
          text: 'Un modello sul tuo hub: niente lascia la casa. Un modello cloud: Hemmia chiede prima, poi invia la chat al fornitore con la tua chiave.',
        },
        {
          title: 'La risposta viene salvata sul tuo dispositivo.',
          text: 'Cifrata sull’hub con la tua passphrase, o sul telefono con una chiave custodita nella sua memoria sicura. Non su un nostro server.',
        },
      ],
    },
    promises: {
      title: 'Sei promesse',
      items: [
        {
          pose: 'house',
          title: 'Chat salvate a casa',
          text: 'Sul tuo hub o sul tuo telefono, cifrate. Con i modelli del tuo hub, niente lascia la casa.',
        },
        {
          pose: 'key',
          title: 'Ognuno ha la propria serratura',
          text: 'Le chat di ognuno sono chiuse con la propria passphrase.',
        },
        {
          pose: 'wave',
          title: 'Nessun account da noi',
          text: 'Non devi mai registrarti da noi per usare Hemmia.',
        },
        {
          pose: 'sleep',
          title: 'Niente pubblicità, nessun tracciamento',
          text: 'Nessuna statistica di utilizzo nelle app o su questo sito.',
        },
        {
          pose: 'glass',
          title: 'La tua scelta di IA',
          text: 'Modelli sul tuo computer, o Anthropic e OpenAI con la tua chiave.',
        },
        {
          pose: 'book',
          title: 'Onesti sui limiti',
          text: 'I modelli locali sono più lenti e meno capaci dei migliori modelli cloud. Lo diciamo.',
        },
      ],
    },
    cost: {
      title: 'Quanto costa',
      intro: 'Hemmia è gratis. Paghi solo ciò che scegli di aggiungere.',
      items: [
        {
          title: 'Hemmia',
          price: 'Gratis',
          text: 'Le app e l’hub. I modelli sul tuo hub costano solo l’elettricità.',
        },
        {
          title: 'Modelli cloud',
          price: 'Ai prezzi del fornitore',
          text: 'Facoltativi, con la tua chiave. Pochi centesimi al giorno per la maggior parte delle persone; imposta un limite di spesa presso il fornitore. Hemmia si ferma anche a un limite mensile per persona.',
        },
        {
          title: 'Hemmia Connect',
          price: 'Gratis durante la beta',
          note: 'poi 29 € all’anno per hub',
          text: 'Facoltativo: i tuoi telefoni raggiungono l’hub con un solo interruttore, a casa e fuori, fino a 20 GB al mese. Gratis durante la beta, poi 30 giorni gratuiti. Oppure configura Tailscale da solo, gratis.',
        },
      ],
    },
    faq: {
      title: 'Domande',
      items: [
        {
          q: 'Vedete le mie chat?',
          a: 'No. Sono salvate sul tuo hub o sul tuo telefono, cifrate. Quando scegli un modello cloud, Hemmia chiede prima e la chat va a quel fornitore con la tua chiave.',
        },
        {
          q: 'Di quale computer ho bisogno per un hub?',
          a: 'Un Mac con chip Apple (M1 o più recente, 16 GB di memoria o più per buoni modelli locali), o qualsiasi computer che esegue Docker. Solo con il telefono non ti serve nessun computer.',
        },
        {
          q: 'Quanto sono buoni i modelli locali?',
          a: 'Buoni per le domande di tutti i giorni, i compiti, le ricette e le lettere; più lenti e meno capaci dei migliori modelli cloud. Puoi usare entrambi e scegliere per ogni chat.',
        },
        {
          q: 'I miei figli possono usarlo?',
          a: 'Sì, con un account per ragazzi che crei per loro: vedono solo i modelli che consenti e non possono creare immagini. Le loro chat sono private, come quelle di tutti.',
        },
        {
          q: 'Cosa succede se perdo la passphrase?',
          a: 'Quando crei l’account ricevi un codice di recupero. Con quello puoi impostare una nuova passphrase. Senza, nessuno può più aprire le tue chat, nemmeno un admin.',
        },
      ],
      more: 'Tutte le domande',
    },
    next: {
      title: 'Prossimamente',
      text: 'Previsti, senza date: l’app per Android e spazi condivisi dalla famiglia.',
    },
    cta: {
      title: 'Porta a casa un’IA privata.',
      text: 'Hemmia è in beta. Hemmia a casa è gratis, con un programma di installazione per il tuo Mac o con Docker; lo usi nel browser e nell’app per iPhone, ora in fase di test.',
      start: 'Inizia',
    },
  },
};
