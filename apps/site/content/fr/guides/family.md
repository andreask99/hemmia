---
title: Inviter ta famille
description: Donne à chacun son propre compte avec un code QR ou un lien, et gère les comptes et les appareils.
nav: guides
order: 70
---

# Inviter ta famille

Chacun a son propre compte avec sa propre phrase de passe. Les admins gèrent les comptes, mais personne sauf le titulaire du compte ne peut lire ses discussions.

<!-- steps -->
## Crée une invitation
Dans Hemmia, ouvre **Réglages → Famille** et touche **Créer un lien d’invitation**. Choisis **Compte admin** pour un autre parent, ou **Compte ado (restreint)** pour un enfant.

## Fais-la scanner, ou envoie le lien
Hemmia affiche un code QR. La personne le scanne avec l’appareil photo de son téléphone, ou tu touches **Envoyer le lien d’invitation** pour l’envoyer par messagerie. L’invitation fonctionne une fois, pendant 7 jours.

<!-- screenshot name="hub-invite" alt="Réglages, Famille : une nouvelle invitation en code QR, avec un bouton Envoyer le lien d’invitation et le lien lui-même" -->

## La personne crée son compte
Elle choisit un nom d’utilisateur et une phrase de passe et reçoit un code de récupération à garder en lieu sûr.
<!-- /steps -->

<!-- note -->
Les liens d’invitation ne fonctionnent que si d’autres appareils peuvent joindre ton hub : active d’abord Hemmia Connect ou configure Tailscale.
<!-- /note -->

## Comptes restreints

Un compte restreint convient aux ados : les admins décident si les comptes restreints peuvent utiliser la recherche web et les modèles cloud, dans **Réglages → Famille**. Tu peux restreindre n’importe quel compte, ou lever la restriction, plus tard.

<!-- screenshot name="hub-family" alt="Réglages, Famille : trois comptes, dont un marqué Restreint, chacun avec des boutons pour désactiver, restreindre et voir les appareils" -->

## Appareils

Chacun voit ses appareils dans **Réglages → Compte → Appareils**, peut en ajouter un autre avec un code QR et retirer un téléphone perdu. Les admins peuvent faire de même pour les autres dans **Réglages → Famille**. Un appareil retiré est déconnecté tout de suite et a besoin d’un nouveau lien pour revenir.

## Désactiver un compte

**Désactiver** empêche un compte de se connecter, sans rien supprimer. **Activer** le rétablit.

## Supprimer un compte

Chacun peut supprimer son propre compte avec tout son contenu dans **Réglages → Compte → Supprimer le compte**, avec sa phrase de passe. Un admin peut supprimer le compte de quelqu’un d’autre dans **Réglages → Famille → Supprimer**, avec sa propre phrase de passe. La suppression est définitive. Un hub garde toujours au moins un admin.
