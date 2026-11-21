---
title: Sauvegardes et récupération
description: Garde ton code de récupération en sécurité, sauvegarde le dossier de données du hub, passe à un nouvel ordinateur et sauvegarde les discussions de ton téléphone.
nav: guides
order: 80
---

# Sauvegardes et récupération

## Ton code de récupération

Quand tu crées ton compte, Hemmia affiche une seule fois un code de récupération. Si tu oublies ta phrase de passe, ce code est le seul moyen de revenir dans ton compte. Personne d’autre ne peut la réinitialiser pour toi, pas même l’admin.

<!-- screenshot name="mac-setup-recovery" alt="L’écran du code de récupération, avec un bouton Copier et une case pour confirmer qu’il est noté" -->

Note-le sur papier et garde-le en lieu sûr, par exemple avec tes autres papiers importants. Ne le garde pas seulement sur le téléphone ou l’ordinateur sur lequel tu utilises Hemmia.

Si tu utilises le code pour définir une nouvelle phrase de passe, tu reçois un nouveau code et l’ancien ne fonctionne plus.

## Sauvegarder le hub

Tout ce que ton hub stocke se trouve dans un seul dossier de données : comptes, discussions, photos et documents. Sauvegarde ce dossier et tu pourras restaurer le hub.

- **Sur un Mac :** le dossier est `Library/Application Support/Hemmia` dans le dossier personnel de l’utilisateur qui a installé Hemmia. Time Machine le sauvegarde automatiquement, même pendant que Hemmia tourne.
- **Avec Docker :** les données sont dans le volume `hemmia-data`. Arrête le hub et copie le volume dans une archive :

  ```sh
  docker compose stop hub
  docker run --rm -v hemmia_hemmia-data:/data -v "$PWD":/backup busybox tar czf /backup/hemmia-data.tar.gz -C /data .
  docker compose start hub
  ```

<!-- note -->
Les discussions dans la sauvegarde sont chiffrées avec la phrase de passe de chacun. Quelqu’un qui trouve la sauvegarde ne peut pas les lire, et toi non plus si tu perds à la fois ta phrase de passe et ton code de récupération.
<!-- /note -->

## Passer à un nouvel ordinateur

<!-- steps -->
## Arrête Hemmia sur l’ancien ordinateur
Lance le désinstallateur (voir [Mettre à jour et désinstaller](/fr/guides/updates/)). Il supprime le programme ; ton dossier de données reste.

## Copie le dossier de données
Copie tout le dossier de données au même endroit sur le nouvel ordinateur, dans le dossier personnel de l’utilisateur qui y fera tourner Hemmia.

## Installe Hemmia sur le nouvel ordinateur
Lance l’installateur. Il trouve les données, démarre le hub et saute la configuration.
<!-- /steps -->

Les comptes, discussions et phrases de passe suivent. Avec l’accès à distance (Hemmia Connect), le hub garde son adresse, donc les téléphones continuent de fonctionner. Avec Tailscale, le nouvel ordinateur a sa propre adresse Tailscale : donne-lui l’ancien nom dans Tailscale, ou reconnecte les téléphones. Les modèles locaux ne sont pas dans le dossier de données ; télécharge-les à nouveau dans **Réglages → Modèles**.

## Les discussions de ton téléphone

En mode téléphone, tes discussions ne sont que sur ton téléphone. Utilise de temps en temps **Réglages → Exporter les discussions** pour les enregistrer dans un fichier, et **Importer des discussions** pour les récupérer, par exemple sur un nouveau téléphone. Voir [Hemmia sur ton téléphone](/fr/guides/phone/).

Le fichier d’export n’est pas protégé, alors garde-le en lieu sûr. Ta clé API n’y est pas.
