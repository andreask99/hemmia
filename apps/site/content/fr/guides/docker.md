---
title: Installer avec Docker
description: Fais tourner le hub Hemmia avec Docker sous Linux, Windows ou sur un NAS, avec des modèles locaux et la recherche web si tu veux.
nav: guides
order: 30
---

# Installer avec Docker

Docker fait tourner le hub sous Linux, sous Windows avec Docker Desktop, ou sur un NAS compatible Docker. Sur un Mac, le [paquet Mac](/fr/guides/mac/) est plus simple.

## Ce qu’il te faut

- Un ordinateur qui reste allumé, avec Docker et Docker Compose (sous Windows : Docker Desktop avec WSL).
- Pour les modèles locaux : 8 Go de mémoire ou plus (16 Go pour les meilleurs modèles), et de la place pour les modèles (plusieurs Go chacun). Les modèles cloud fonctionnent sans.
- `git`, pour télécharger Hemmia depuis [GitHub](https://github.com/andreask99/hemmia).

<!-- steps -->
## Télécharge Hemmia
```sh
git clone https://github.com/andreask99/hemmia.git
cd hemmia/packaging/docker
```

## Lance-le
```sh
./start.sh
```

Cela démarre le hub, Ollama pour les modèles locaux et la recherche web. La première fois, il construit le hub et télécharge Ollama et le moteur de recherche, ce qui prend quelques minutes. Quand le hub est prêt, il ouvre la configuration dans ton navigateur, ou affiche son adresse.

## Termine la configuration
Donne un nom à ta famille, crée ton compte, note le code de récupération, choisis ton IA (le hub recommande un modèle adapté à cet ordinateur) et active l’accès à distance. Connecte ensuite ton téléphone : voir [Connecter ton téléphone](/fr/guides/phone-to-hub/).
<!-- /steps -->

Sans modèles locaux : `./start.sh --no-ollama`. Sans recherche web : `./start.sh --no-search`. Si le port 8787 est déjà pris sur cet ordinateur, mets `HEMMIA_PORT=8790` (ou un autre port libre) dans le fichier `.env` de ce dossier.

## Un ordinateur sans navigateur

Sur un NAS ou un serveur, tu ne peux pas ouvrir `localhost` dans un navigateur. Mets `HEMMIA_CONNECT=1` dans le fichier `.env` de `packaging/docker` et lance `./start.sh`. Hemmia Connect est activé tout de suite, et le journal affiche aussi un lien `https://…/setup#…` qui fonctionne depuis n’importe quel appareil. Traite ce lien comme un mot de passe jusqu’à la fin de la configuration. Hemmia Connect est un service de notre part : en l’activant, tu acceptes les [Conditions d’utilisation](/fr/legal/terms/).

## Un Ollama déjà installé

Si Ollama tourne déjà sur l’ordinateur, lance `./start.sh --no-ollama` et mets `OLLAMA_URL=http://host.docker.internal:11434` dans `.env`. Sous Linux, Ollama n’écoute par défaut que sur l’ordinateur lui-même, donc le conteneur ne peut pas le joindre : règle `OLLAMA_HOST=0.0.0.0` pour le service Ollama et assure-toi que ton pare-feu garde le port 11434 fermé au réseau, ou utilise simplement l’Ollama de Hemmia (`./start.sh` tout court).

## Mises à jour et sauvegardes

Voir [Mettre à jour et désinstaller](/fr/guides/updates/) et [Sauvegardes et récupération](/fr/guides/backup/). Toutes les données du hub sont dans le volume Docker `hemmia-data`.
