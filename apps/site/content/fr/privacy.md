---
title: Confidentialité et sécurité, expliquées
description: Ce qui reste sur tes appareils, ce qui va à un fournisseur d’IA, ce que voit notre relais et ce que garde ce site.
nav: privacy
order: 20
---

# Confidentialité et sécurité, expliquées

Cette page dit en mots simples ce qui arrive à tes données. Les détails techniques sont dans la [conception de sécurité](https://github.com/andreask99/hemmia/blob/main/docs/SECURITY.md), publiée avec le code source. Les détails qui font foi sont dans notre [Politique de confidentialité](/fr/legal/privacy/).

## Ce qui reste sur tes appareils

- **À la maison :** tes discussions, photos et documents sont stockés sur ton hub. Le contenu de chacun est chiffré avec une clé issue de sa propre phrase de passe, donc les autres membres de la famille, et le compte admin du hub, ne peuvent pas le lire. Si tu oublies ta phrase de passe, ton code de récupération te permet de revenir. La liste de courses familiale est l’exception : toute la famille la partage, donc elle est chiffrée avec une clé familiale conservée sur le hub. Quelqu’un qui a l’ordinateur du hub ou ses sauvegardes pourrait la lire ; ta liste perso reste aussi privée que tes discussions.
- **Sur ton téléphone :** tes discussions et photos sont stockées dans l’app, chiffrées avec une clé que seul le stockage sécurisé du téléphone détient.
- Il n’y a pas de compte Hemmia et pas de serveur à nous qui garde tes discussions.

**Une limite :** pendant que tu utilises Hemmia, le hub doit déchiffrer tes messages pour y répondre. Quelqu’un qui contrôle entièrement l’ordinateur du hub à ce moment-là (pas seulement le compte admin) pourrait en théorie les lire. Le chiffrement protège ce qui est stocké, et protège chacun des autres.

## Ce qui va à un fournisseur d’IA, et quand

- **Les modèles locaux** tournent sur ton hub. Ce que tu leur écris ne quitte jamais ta maison.
- **Les modèles cloud** (Anthropic, OpenAI et d’autres) reçoivent les messages des discussions que tu as avec eux, parce qu’ils écrivent les réponses. Cela n’arrive qu’avec une clé que tu as ajoutée toi-même, et seulement pour les discussions où tu as choisi l’un de ces modèles. Sur un hub, ta clé est stockée chiffrée avec ta phrase de passe ; personne d’autre, pas même l’admin, ne peut la voir ou l’utiliser. Les règles de confidentialité du fournisseur s’appliquent à ce qu’il reçoit.
- Sur le téléphone, l’app parle directement au fournisseur. Ta clé est gardée dans le stockage sécurisé du téléphone et n’est envoyée qu’à ce fournisseur.

## Ce que voit notre relais (Hemmia Connect)

Si tu actives Hemmia Connect, les téléphones joignent ton hub via notre relais quand ils ne sont pas à la maison.

- La connexion est chiffrée de ton téléphone jusqu’à ton hub. Le relais la transmet, mais il n’a pas les clés pour l’ouvrir. Il ne voit jamais tes messages, tes phrases de passe, tes photos ni dans quelle discussion tu es.
- Il sait par contre : l’adresse de ton hub, quand il s’est connecté pour la dernière fois, combien de données sont passées ce mois-ci et, pendant qu’une connexion est ouverte, l’adresse IP du téléphone qui se connecte, qu’il transmet aussi à ton hub pour que celui-ci puisse bloquer les tentatives de deviner un mot de passe. Les journaux ne gardent les adresses IP que raccourcies.
- **Ce qu’il pourrait faire en théorie :** celui qui gère le relais contrôle les adresses sous son domaine ; il pourrait donc en théorie obtenir un certificat pour l’adresse de ton hub et intercepter les connexions pendant ce temps. Chaque certificat de ce genre est publié dans des journaux publics, où il est visible. Il gère aussi la page d’accueil des liens partagés ; une page modifiée pourrait donc lire un lien d’invitation ou de connexion, sans laisser de trace publique (les liens de connexion ne fonctionnent qu’une fois, pendant 10 minutes). Nous ne faisons ni l’un ni l’autre, et le code est public. C’est la même confiance que tu accordes à n’importe quel site web. Si tu préfères ne pas l’accorder, utilise **Tailscale**, ou utilise le hub seulement dans un navigateur sur son propre ordinateur.

## Notifications

Quand une réponse ou une image est prête, ton téléphone reçoit une notification. Elle ne contient rien : le texte que tu vois (« Ta réponse est prête ») vient de l’app elle-même, et la référence à la discussion est chiffrée par ton hub, donc ni Apple ni notre relais ne peuvent savoir de quelle discussion il s’agit.

## Vérification des mises à jour

Une fois par jour, un hub installé avec notre paquet ou notre image Docker demande à notre serveur s’il existe une version plus récente. Cette demande dit seulement quelle version il fait tourner, s’il s’agit de la version Mac ou Docker, et s’il suit les versions normales ou de test. Nous comptons ces demandes par jour, pour savoir à peu près combien de hubs font tourner quelle version. Nous ne stockons pas ton adresse IP, et rien sur toi ou ta famille n’est envoyé. La réponse est signée, donc ton hub ne lui fait confiance que si elle vient vraiment de nous. Avec Docker, tu désactives la vérification avec `HEMMIA_UPDATE_CHECK=0` dans `.env`. Sur un Mac, un interrupteur dans les réglages est prévu ; d’ici là, écris-nous et nous t’expliquerons comment faire.

Par ailleurs, ton hub récupère une fois par jour la liste des modèles que Hemmia propose. Cette demande ne contient rien sur ton hub ni sur ta famille ; nous ne la comptons pas et ne gardons pas ton adresse IP. Tu la désactives dans Réglages → Modèles.

## Ce site

Pas de cookies, pas de statistiques d’audience, pas de pixels de pistage, pas de polices ni de scripts d’autres sites. Le serveur qui héberge les fichiers peut garder des journaux d’accès standard ; nous ne les utilisons pas pour suivre qui que ce soit.

## Open source

Le code de Hemmia est [publié sur GitHub](https://github.com/andreask99/hemmia) sous licence AGPL, pour que chacun puisse vérifier ce qu’il fait. Si tu trouves un problème de sécurité, signale-le en privé, via le [signalement privé de GitHub](https://github.com/andreask99/hemmia/security/advisories/new) ou à andreas.apps@icloud.com, et nous le corrigerons le plus vite possible.

Les détails qui font foi sont dans notre [Politique de confidentialité](/fr/legal/privacy/) et nos [Conditions d’utilisation](/fr/legal/terms/).
