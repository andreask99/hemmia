---
title: Choisir des modèles d’IA
description: Des modèles locaux sur ton hub, d’autres serveurs locaux comme LM Studio, et des modèles cloud avec ta propre clé.
nav: guides
order: 50
---

# Choisir des modèles d’IA

Hemmia peut utiliser deux sortes de modèles, et tu peux les combiner : choisis un modèle pour chaque discussion.

| | Modèles locaux | Modèles cloud |
| --- | --- | --- |
| Où ils tournent | Sur ton hub | Chez le fournisseur (Anthropic, OpenAI, OpenRouter) |
| Tes messages | Restent à la maison | Partent chez le fournisseur pour les discussions où tu les choisis |
| Coût | L’électricité | Tu paies le fournisseur pour ce que tu utilises |
| Vitesse et capacités | Bons pour le quotidien, plus lents sur les petits ordinateurs | Les modèles les plus puissants disponibles |

## Modèles locaux

Les modèles locaux ont besoin d’[Ollama](https://ollama.com) sur le hub. Plus ton ordinateur a de mémoire, plus les modèles qu’il peut faire tourner sont grands (et bons).

<!-- steps -->
## Ouvre les réglages des modèles
Dans Hemmia, ouvre **Réglages → Modèles**. Les admins voient la section **Pour toute la famille**.

## Choisis un modèle
Sous **Ajouter un modèle**, Hemmia liste les modèles adaptés à la mémoire de ton ordinateur, le plus adapté étant marqué **Recommandé**. Les modèles qui demandent plus de mémoire sont grisés.

## Télécharge-le
Touche **Télécharger**. Un modèle fait quelques gigaoctets, cela peut donc prendre un moment ; tu peux quitter la page, le téléchargement continue.
<!-- /steps -->

Une fois téléchargé, le modèle apparaît dans la liste des modèles de tout le monde. Chacun peut choisir son propre **Modèle par défaut pour les nouvelles discussions**.

### LM Studio et autres serveurs locaux

Si tu fais déjà tourner LM Studio, llama.cpp ou vLLM sur cet ordinateur ou sur un autre de ton réseau domestique, ajoute-le sous **Autres serveurs locaux** avec son adresse. Ses modèles apparaissent alors aussi dans Hemmia.

## Modèles cloud avec ta propre clé

Chacun ajoute sa propre clé ; elle est stockée chiffrée avec sa phrase de passe, donc personne d’autre, pas même l’admin, ne peut la voir ou l’utiliser.

<!-- steps -->
## Obtiens une clé
Crée une clé API chez ton fournisseur : Anthropic sur platform.claude.com, OpenAI sur platform.openai.com, ou OpenRouter sur openrouter.ai. Fixe aussi une limite de dépenses mensuelle là-bas.

## Ajoute-la dans Hemmia
Ouvre **Réglages → Modèles → IA cloud**, choisis le fournisseur, colle la clé et touche **Vérifier et enregistrer**. Hemmia vérifie la clé auprès du fournisseur sans envoyer aucune de tes discussions.

## Si tu veux, fixe une limite
Sous **Limite mensuelle en dollars US**, Hemmia peut arrêter d’utiliser les modèles cloud pour toi quand tes dépenses estimées atteignent la limite.
<!-- /steps -->

<!-- note -->
Seules les discussions où tu choisis un modèle cloud partent chez le fournisseur, avec ce dont le modèle a besoin pour répondre : la discussion jusqu’ici, ses photos et documents. Les discussions avec les modèles locaux ne quittent jamais la maison.
<!-- /note -->
