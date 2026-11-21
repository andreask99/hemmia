---
title: Hors de la maison
description: Joins ton hub depuis tes téléphones avec Hemmia Connect ou Tailscale. Ce que le relais peut voir et ce qu’il ne peut pas voir.
nav: guides
order: 75
---

# Hors de la maison

Ton hub ne répond que sur son propre ordinateur. Pour tes téléphones, à la maison et en déplacement, choisis l’une des trois façons pendant la configuration (étape **Hors de la maison**) ou plus tard dans **Réglages → Système → Accès à distance**.

| | Hemmia Connect | Tailscale | Pas maintenant |
| --- | --- | --- | --- |
| Fonctionne | Partout | Partout | Seulement dans un navigateur sur l’ordinateur du hub |
| Sur chaque téléphone | Rien de plus | L’app Tailscale et un compte | – |
| Qui transmet le trafic | Notre relais (il ne peut pas le lire) | Le réseau de Tailscale | – |
| Effort | Un interrupteur | Quelques étapes, en partie dans le Terminal | Aucun |

## Hemmia Connect

Active **Hemmia Connect** : pendant la configuration avec **Activer Connect**, ou plus tard avec l’interrupteur dans **Réglages → Système → Accès à distance**. Ton hub reçoit sa propre adresse, et les téléphones le joignent par notre relais. Connect empêche aussi l’ordinateur de se mettre en veille.

La connexion est chiffrée de ton téléphone jusqu’à ton hub. Le relais la transmet mais n’a pas les clés pour l’ouvrir : il ne voit jamais tes messages, tes phrases de passe ni tes photos. La [page sur la confidentialité](/fr/privacy/) explique ce qu’il pourrait faire en théorie, et pourquoi les journaux de certificats le montreraient.

Les réglages montrent si Connect fonctionne, combien de temps le certificat du hub est valable et combien de données sont passées par le relais ce mois-ci. **Oublier cette adresse** abandonne l’adresse ; les téléphones connectés via Connect ont alors besoin d’un nouveau lien.

Chaque hub peut faire passer jusqu’à 20 Go par mois par le relais ; une famille en utilise d’habitude un à trois. Si un hub atteint cette limite, les téléphones ne peuvent plus le joindre via Connect jusqu’au début du mois suivant (compté en UTC) ; Tailscale continue de fonctionner.

Si Connect ne fonctionne plus pendant dix minutes (le relais est en panne, ou internet à la maison), les admins reçoivent une notification, et une autre quand il fonctionne à nouveau. Le hub essaie de se reconnecter tout seul.

## Tailscale

Tailscale est un réseau privé que tu gères toi-même. Chaque téléphone a besoin de l’app Tailscale et doit être connecté au même réseau.

<!-- steps -->
## Installe Tailscale sur l’ordinateur du hub
Installe Tailscale depuis [tailscale.com](https://tailscale.com) et connecte-toi.

## Active les certificats HTTPS
Dans la console d’administration de Tailscale, ouvre **DNS** et, sous **HTTPS Certificates**, choisis **Enable HTTPS**.

## Connecte Hemmia à Tailscale
Sur un Mac, ouvre le Terminal et lance :

```sh
"/Library/Application Support/Hemmia/current/packaging/tailscale.sh"
```

Cela publie le hub uniquement dans ton réseau Tailscale (jamais sur l’internet public), le redémarre et affiche sa nouvelle adresse.

Avec Docker, lance `tailscale serve --bg --https=443 http://127.0.0.1:8787` sur l’ordinateur, mets `HEMMIA_PUBLIC_HOSTNAMES=<nom>.ts.net` (son nom donné par `tailscale status`) dans `.env` à côté de `compose.yaml`, et relance `docker compose up -d`.

## Ajoute les téléphones
Installe Tailscale sur chaque téléphone et connecte-toi au même réseau. Connecte ensuite les téléphones au hub comme dans [Connecter ton téléphone](/fr/guides/phone-to-hub/).
<!-- /steps -->

## Pas maintenant

Sans accès à distance, Hemmia ne fonctionne que dans un navigateur sur l’ordinateur du hub. Tu peux activer Connect ou configurer Tailscale à tout moment plus tard.
