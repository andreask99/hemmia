---
title: Obtenir une clé API
description: Crée une clé chez Anthropic ou OpenAI, fixe une limite de dépenses mensuelle et garde la clé en sécurité.
nav: guides
order: 20
---

# Obtenir une clé API

Une clé API permet à Hemmia d’utiliser les modèles d’un fournisseur en ton nom. Tu paies directement le fournisseur pour ce que tu utilises ; Hemmia n’ajoute rien. Une journée de discussion typique coûte quelques centimes.

La clé est distincte d’un abonnement ChatGPT ou Claude : même si tu en as un, il te faut un compte sur la plateforme développeur du fournisseur et un moyen de paiement chez lui.

## Anthropic (modèles Claude)

<!-- steps -->
## Crée un compte
Ouvre la [Claude Console](https://platform.claude.com) et inscris-toi ou connecte-toi.

## Ajoute un moyen de paiement
Ouvre **Settings → Billing**, ajoute une carte et achète un petit montant de crédit pour commencer, par exemple cinq dollars. Laisse la recharge automatique désactivée : tu ne pourras alors jamais dépenser plus que le crédit acheté.

## Fixe une limite de dépenses
Sur la même page **Billing**, sous **Spend limits**, choisis **Set limit** et saisis un montant mensuel, par exemple dix dollars. Quand il est atteint, les requêtes s’arrêtent jusqu’au début du mois suivant au lieu de coûter davantage.

## Crée la clé
Ouvre [API keys](https://platform.claude.com/settings/keys), crée une clé et donne-lui un nom comme « Hemmia téléphone ». Copie-la tout de suite : la console ne l’affiche qu’une fois.
<!-- /steps -->

## OpenAI (modèles GPT)

<!-- steps -->
## Crée un compte
Ouvre l’[OpenAI Platform](https://platform.openai.com) et inscris-toi ou connecte-toi.

## Ajoute un moyen de paiement
Dans **Settings**, sous **Organization**, ouvre **Billing**, ajoute une carte et achète un petit montant de crédit pour commencer. Laisse la recharge automatique désactivée.

## Fixe une limite de dépenses
Au même endroit, ouvre **Limits** et fixe une limite de dépenses mensuelle stricte (hard limit). Une alerte de dépenses n’envoie qu’un e-mail ; c’est la limite stricte qui arrête les requêtes quand elle est atteinte.

## Crée la clé
Ouvre [API keys](https://platform.openai.com/api-keys), crée une nouvelle clé secrète et donne-lui un nom comme « Hemmia téléphone ». Copie-la tout de suite : elle n’est affichée qu’une fois.
<!-- /steps -->

## Utiliser la clé

Sur ton téléphone, colle la clé dans Hemmia et touche **Vérifier et enregistrer** (voir [Hemmia sur ton téléphone](/fr/guides/phone/)). Sur un hub à la maison, chacun ajoute sa propre clé dans **Réglages → Modèles → IA cloud** ; un hub peut aussi utiliser OpenRouter (voir [Choisir des modèles d’IA](/fr/guides/models/)).

## Garder la clé en sécurité

<!-- note -->
Traite la clé comme un mot de passe : quiconque l’a peut utiliser ton crédit. Ne l’envoie jamais dans une discussion, un e-mail ou une capture d’écran.
<!-- /note -->

- Sur le téléphone, Hemmia garde la clé dans le trousseau sécurisé du téléphone et ne l’affiche que raccourcie. Elle n’est pas dans les exports de discussions.
- Si tu penses que quelqu’un d’autre a ta clé, supprime-la dans la console du fournisseur et crée-en une nouvelle. Utilise ensuite **Remplacer** dans les réglages de Hemmia.
- Utilise une clé par appareil ou par hub. Tu pourras ainsi en supprimer une sans toucher aux autres.
