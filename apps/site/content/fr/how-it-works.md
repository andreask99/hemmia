---
title: Comment ça marche
description: Ta propre IA sur un ordinateur à la maison, l’app Hemmia sur vos téléphones, et les deux façons de les relier.
nav: how
order: 10
---

# Comment ça marche

Hemmia tourne sur un ordinateur à la maison, le *hub*. Toute la famille l’utilise avec l’app Hemmia sur son téléphone, ou dans un navigateur sur une tablette ou un ordinateur portable. L’app se connecte au hub, à la maison comme en déplacement.

<!-- diagram name="how" -->

## Le hub à la maison

Le hub est un Mac, ou n’importe quel ordinateur capable de faire tourner Docker, comme un PC ou un NAS. Tu y installes Hemmia une fois, et il reste allumé.

- **Les modèles locaux** tournent sur le hub lui-même, via Ollama ou LM Studio. Rien de ce que tu écris ne quitte la maison. Ils sont plus lents et moins capables que les meilleurs modèles cloud, mais ils progressent vite.
- **Les modèles cloud** sont facultatifs : chacun peut ajouter sa propre clé d’Anthropic, d’OpenAI ou d’OpenRouter. La clé est stockée chiffrée avec la phrase de passe de cette personne, donc personne d’autre ne peut la voir ou l’utiliser. Les discussions avec ces modèles partent chez ce fournisseur.
- **Un compte par personne.** Les discussions de chacun sont chiffrées avec une clé issue de sa propre phrase de passe. La personne qui gère le hub ne peut pas lire les discussions des autres.

<!-- screenshot name="hub-chat" alt="Une discussion sur le hub dans le navigateur : une question sur des idées de dîner et la réponse avec trois propositions ; des discussions plus anciennes dans la barre latérale" -->

## Comment l’app joint le hub

Par sécurité, le hub ne répond que sur son propre ordinateur. Pour que vos téléphones puissent y accéder, à la maison comme en déplacement, il lui faut une connexion protégée. Tu en choisis une parmi deux :

- **Tailscale : gratuit, avec un peu de configuration.** Tailscale est un réseau privé (un VPN), gratuit pour un usage personnel. Tu crées un compte Tailscale, tu installes Tailscale sur l’ordinateur du hub et l’app Tailscale sur chaque téléphone, tu les connectes tous au même réseau et tu actives HTTPS une fois. Ensuite, tout fonctionne tout seul. [Pas à pas](/fr/guides/remote/)
- **Hemmia Connect : prêt en un seul geste.** Pour ceux qui préfèrent ne rien configurer. Active-le pendant la configuration du hub, et ton hub reçoit sa propre adresse ; les téléphones le rejoignent en scannant un code, sans rien installer de plus. Notre relais transmet le trafic sans pouvoir le lire : la connexion est chiffrée de ton téléphone jusqu’à ton hub. Connect est gratuit pendant la bêta.

Tu peux commencer par l’un et passer à l’autre plus tard. Ou te passer des deux et utiliser Hemmia seulement dans un navigateur sur l’ordinateur du hub.

## Sans hub : juste l’app

Si tu n’as pas d’ordinateur qui peut rester allumé, l’app Hemmia fonctionne aussi seule. Elle parle alors directement au fournisseur d’IA que tu as choisi, Anthropic (Claude) ou OpenAI, avec ta propre clé. Aucun serveur à nous entre les deux.

- Ta clé est gardée dans le stockage sécurisé du téléphone (le trousseau sur l’iPhone) et ne quitte jamais le téléphone, sauf vers le fournisseur.
- Tes discussions sont enregistrées sur le téléphone, chiffrées.
- Tu paies le fournisseur pour ce que tu utilises. Une journée de discussion typique coûte quelques centimes.

Tu pourras ajouter un hub plus tard.

[La confidentialité, expliquée](/fr/privacy/) · [Questions et réponses](/fr/faq/)
