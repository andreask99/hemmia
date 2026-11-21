---
title: Mettre à jour et désinstaller
description: Comment tu apprends qu’une nouvelle version existe, comment l’installer, et comment supprimer Hemmia en gardant tes données.
nav: guides
order: 85
---

# Mettre à jour et désinstaller

## Apprendre qu’une nouvelle version existe

Les admins voient un avis dans **Réglages → Système** quand une nouvelle version est disponible, avec un lien vers les nouveautés et la façon de mettre à jour.

## Mettre à jour sur un Mac

Télécharge le nouveau paquet depuis la [page de téléchargement](/fr/download/) et installe-le comme la première fois. L’installateur garde tes données, remplace le programme et redémarre le hub ; la configuration ne se relance pas. Les téléphones restent connectés. Les réponses en cours de rédaction à ce moment s’arrêtent, alors mets à jour quand personne ne discute.

## Mettre à jour avec Docker

Dans le dossier `packaging/docker`, récupère la nouvelle version et redémarre le hub :

```sh
git pull
./start.sh
```

Tes données restent dans le volume `hemmia-data`. Utilise les mêmes options qu’au démarrage, par exemple `./start.sh --no-ollama`.

## Désinstaller sur un Mac

Ouvre le Terminal et lance :

```sh
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

Cela supprime le programme et arrête le hub, et avec lui l’Ollama, les images et la recherche web installés par Hemmia. Tes discussions et réglages restent dans `Library/Application Support/Hemmia` dans ton dossier personnel ; supprime ce dossier toi-même si tu veux aussi les effacer. Les modèles téléchargés sont dans `.ollama` dans ton dossier personnel ; supprime-les aussi si aucune autre app n’utilise Ollama.
