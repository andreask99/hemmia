---
title: Dépannage
description: Que faire quand le hub est injoignable, qu’un lien de configuration a expiré, que tu as oublié ta phrase de passe, qu’un modèle est lent ou qu’une clé est refusée.
nav: help
order: 90
---

# Dépannage

## L’app dit que le hub est injoignable

L’app montre ce qu’il faut vérifier et quand elle a joint le hub pour la dernière fois depuis ce téléphone.

- L’ordinateur est-il allumé et éveillé ? Un Mac en veille ne peut pas répondre.
- A-t-il internet ?
- Hemmia Connect ou Tailscale est-il activé ? Les téléphones ne joignent le hub que par l’un des deux, même à la maison : voir [Comment ça marche](/fr/how-it-works/).

Touche **Réessayer** quand l’ordinateur est de retour, ou **Passer à un autre hub** pour en ouvrir un autre.

## Le lien de configuration ne fonctionne pas

La page de configuration a besoin du lien ouvert par l’installateur. Si elle affiche **Ouvre le lien de configuration de l’installateur**, rouvre la page depuis l’installateur. Un lien de configuration est valable 24 heures. Sur un Mac, relance l’installateur : il redémarre Hemmia et ouvre la page de configuration avec un nouveau lien (ou l’actuel, s’il est encore valable). Avec Docker, lance `docker compose restart hub` et ouvre le nouveau lien depuis `docker compose logs hub`.

## J’ai oublié ma phrase de passe

Sur la page de connexion, touche **Phrase de passe oubliée ?** et saisis ton nom d’utilisateur, ton code de récupération et une nouvelle phrase de passe. Tu reçois alors un nouveau code de récupération ; l’ancien ne fonctionne plus. Note le nouveau.

<!-- note -->
Personne d’autre ne peut réinitialiser ta phrase de passe, pas même un admin : tes discussions sont chiffrées avec elle. Sans la phrase de passe et le code de récupération, ton compte ne peut plus être ouvert. Un admin peut alors **Désactiver** l’ancien compte dans **Réglages → Famille** et t’inviter à nouveau : tu repars avec un nouveau compte vide, sous un autre nom d’utilisateur.
<!-- /note -->

## Un modèle est très lent

Les modèles locaux tournent sur l’ordinateur du hub, et les grands modèles demandent beaucoup de mémoire. Dans **Réglages → Modèles**, Hemmia signale les modèles qui conviennent à ton ordinateur ; choisis-en un plus petit, ou utilise un modèle cloud pour les questions longues ou difficiles. Voir [Choisir des modèles d’IA](/fr/guides/models/).

## Ma clé est refusée

- **Cette clé a été refusée :** vérifie que tu l’as copiée en entier, sans espace au début ni à la fin. Si ça échoue encore, crée une nouvelle clé dans la console du fournisseur.
- **Ta clé a atteint sa limite pour l’instant :** tu as atteint la limite de débit du fournisseur ou ta limite de dépenses. Réessaie plus tard, ou augmente la limite dans la console du fournisseur.
- **Le fournisseur est occupé :** réessaie dans une minute.

## Les notifications n’arrivent pas

Vérifie que les notifications de Hemmia sont autorisées dans les Réglages du téléphone, et que le hub est connecté à internet. Les notifications viennent du hub, elles n’arrivent donc que lorsqu’il est allumé.

## Contact

Toujours bloqué ? Écris à [andreas.apps@icloud.com](mailto:andreas.apps@icloud.com), en français, anglais, allemand ou italien. Indique l’appareil et la version que tu utilises (dans les réglages de l’app) ; n’envoie jamais ta phrase de passe, ton code de récupération ni tes clés.
