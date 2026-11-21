---
title: Installer Hemmia sur un Mac
description: Installe le hub sur un Mac avec puce Apple, configure-le dans ton navigateur et connecte ton téléphone.
nav: guides
order: 20
---

# Installer Hemmia sur un Mac

Le hub est l’ordinateur de la maison qui fait tourner Hemmia pour ta famille. Un Mac convient bien : il est silencieux, consomme peu, et les Mac avec puce Apple font tourner vite les modèles d’IA locaux.

## Ce qu’il te faut

- Un Mac avec puce Apple (M1 ou plus récent) et macOS 14 ou plus récent.
- 8 Go de mémoire font tourner un petit modèle local ; 16 Go ou plus, c’est mieux, et les images demandent 24 Go. Les modèles cloud fonctionnent avec n’importe quel Mac.
- Environ 10 Go d’espace disque libre pour un modèle local, et 6 Go de plus pour les images.
- Le Mac doit rester allumé. Hemmia l’empêche de se mettre en veille tant que des téléphones doivent le joindre.

<!-- steps -->
## Télécharge et installe
Télécharge le paquet du hub Hemmia depuis la [page de téléchargement](/fr/download/) et ouvre-le. L’installateur demande le mot de passe de ton Mac, parce que le programme va dans le dossier Application Support du système.

## Configure dans le navigateur
Quand l’installateur a terminé, ton navigateur ouvre la configuration de Hemmia. Donne un nom à ta famille, crée ton propre compte et note le code de récupération. Si tu as fermé la page ou attendu plus d’un jour, relance l’installateur : il ouvre la configuration avec un nouveau lien.

<!-- screenshot name="mac-setup-welcome" alt="La première étape de configuration : bienvenue dans Hemmia, avec la mémoire et l’espace disque de ce Mac et un champ pour le nom de famille" -->


## Choisis ton IA
Hemmia recommande un modèle local adapté à ce Mac : télécharge-le, ajoute une clé cloud, ou les deux. Si Ollama n’est pas encore installé, **Installer Ollama** s’en charge pour toi. Ici, tu peux aussi **Activer les images** et **Activer la recherche web**. Tu pourras tout changer plus tard dans Réglages → Modèles.

<!-- screenshot name="mac-setup-models" alt="La liste des modèles dans la configuration : modèles locaux recommandés avec leur taille de téléchargement, certains déjà téléchargés" -->


## Rends-le joignable pour les téléphones
Les téléphones ne joignent le hub que par Hemmia Connect ou Tailscale, même à la maison. Active Connect, ou choisis Tailscale et suis [Hors de la maison](/fr/guides/remote/). Avec « Pas maintenant », Hemmia ne fonctionne que dans un navigateur sur ce Mac.

<!-- screenshot name="mac-setup-remote" alt="Le choix entre Hemmia Connect (recommandé), Tailscale et Pas maintenant" -->


## Ajoute ton téléphone
Installe l’app Hemmia sur ton téléphone, touche **Scanner le code** et scanne le code affiché sur l’écran du Mac. Ton téléphone se connecte à ton compte. D’autres téléphones : [Connecter ton téléphone](/fr/guides/phone-to-hub/).

<!-- screenshot name="mac-setup-phone" alt="La dernière étape de configuration : un code QR qui connecte le téléphone" -->

<!-- /steps -->

<!-- note -->
Les modèles locaux tournent avec [Ollama](https://ollama.com). Si ce Mac ne l’a pas encore, l’étape des modèles propose **Installer Ollama** : Hemmia le télécharge, le vérifie et le démarre pour toi. Si tu utilises déjà l’app Ollama, Hemmia utilise celle-là. Les modèles cloud fonctionnent sans Ollama.
<!-- /note -->

## Où vivent tes données

Tes discussions et réglages sont stockés dans la bibliothèque de ton utilisateur : `~/Library/Application Support/Hemmia`. Garde ce dossier dans tes sauvegardes (Time Machine l’inclut) ; voir [Sauvegardes et récupération](/fr/guides/backup/).

## Désinstaller

Lance ceci dans le Terminal :

```
sudo "/Library/Application Support/Hemmia/current/packaging/uninstall.sh"
```

Cela supprime le programme, garde ton dossier de données et t’indique où il se trouve. Mises à jour : [Mettre à jour et désinstaller](/fr/guides/updates/).
