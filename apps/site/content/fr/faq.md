---
title: Questions et réponses
description: Des réponses courtes sur le prix, la confidentialité, les modèles, le relais et l’open source.
nav: faq
order: 90
---

# Questions et réponses

## Hemmia est-il gratuit ?

Oui. Les apps et le hub sont gratuits, et il n’y a pas de compte chez nous. Le seul supplément payant facultatif est Hemmia Connect, qui permet à tes téléphones de joindre le hub d’un simple bouton (gratuit pendant la bêta). Tailscale fait la même chose gratuitement si tu l’installes toi-même. Si tu utilises des modèles cloud, tu paies directement le fournisseur (Anthropic, OpenAI ou OpenRouter) pour ce que tu utilises. Les modèles locaux sur ton hub ne coûtent que l’électricité.

## Combien coûtent les modèles cloud ?

Cela dépend de la quantité que tu écris et du modèle choisi. Une journée de discussion typique coûte quelques centimes. Les fournisseurs permettent de fixer une limite de dépenses mensuelle, et nous te le recommandons.

## Vous voyez mes discussions ?

Non. Tes discussions sont stockées sur ton hub ou ton téléphone, chiffrées. Nous ne faisons tourner aucun serveur qui les garde, et notre relais ne peut pas lire le trafic qu’il transmet. Voir [La confidentialité, expliquée](/fr/privacy/).

## Quels modèles d’IA puis-je utiliser ?

Sur un hub : des modèles locaux via Ollama ou LM Studio, et des modèles cloud d’Anthropic, d’OpenAI et d’OpenRouter avec une clé. Sur le téléphone seul : Anthropic et OpenAI avec ta propre clé. Tu peux choisir un modèle différent pour chaque discussion.

## Les modèles locaux sont-ils bons ?

Bons pour les questions du quotidien, la rédaction et les résumés, et ils gardent tout à la maison. Les meilleurs modèles cloud restent plus rapides et plus capables pour les tâches difficiles. Hemmia recommande les modèles locaux qui conviennent à la mémoire de ton ordinateur.

## De quel ordinateur ai-je besoin pour un hub ?

Un Mac avec puce Apple (16 Go de mémoire ou plus, c’est l’idéal pour les modèles locaux), ou n’importe quel ordinateur qui fait tourner Docker, comme un PC ou un NAS. Si tu n’utilises que des modèles cloud, un petit ordinateur suffit. Il doit rester allumé.

## Pourquoi y a-t-il un relais ?

Pour que ton téléphone puisse joindre ton hub, à la maison et en déplacement, sans ouvrir ton routeur ni rien configurer. Le relais ne fait que transmettre du trafic chiffré. Si tu préfères, utilise plutôt Tailscale.

## Mes enfants peuvent-ils l’utiliser ?

Oui, sur un hub géré par un parent. Chacun a son propre compte et ses propres discussions privées, et un admin peut créer des comptes ados qui ne voient que les modèles autorisés par l’admin, cherchent sur le web avec un SafeSearch strict ou pas du tout, et ne peuvent pas créer d’images. L’app elle-même est destinée aux personnes de 13 ans et plus ; les plus jeunes l’utilisent avec un parent.

## Que se passe-t-il si je perds ma phrase de passe ?

Utilise ton code de récupération, que tu as gardé en créant ton compte. Sans phrase de passe ni code de récupération, personne ne peut ouvrir tes discussions, pas même la personne qui gère le hub.

## Hemmia est-il open source ?

Oui. Le code est [sur GitHub](https://github.com/andreask99/hemmia) sous licence AGPL, pour que chacun puisse vérifier ce qu’il fait et comment il protège tes données.
