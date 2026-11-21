---
title: Politique de confidentialité
description: Comment les apps Hemmia, Hemmia Connect, la vérification des mises à jour et ce site traitent les données personnelles, selon la LPD suisse et le RGPD européen.
nav: legal
order: 900
date: 2026-11-21
---

# Politique de confidentialité

Dernière mise à jour : 21 novembre 2026 · S’applique aux apps Hemmia, au logiciel du hub Hemmia tel que nous le distribuons, à Hemmia Connect (notre relais), à la vérification des mises à jour et à ce site (hemmia.app).

<!-- note -->
**L’essentiel**

- **Pas de compte chez nous.** Tu n’as pas besoin d’un compte chez nous pour utiliser Hemmia. Si tu nous écris, nous envoies une question ou participes à la bêta, nous recevons ton adresse e-mail (section 16).
- **Tes discussions ne sont pas stockées chez nous.** Elles vivent sur ton propre hub Hemmia (un ordinateur à la maison) ou sur ton téléphone, chiffrées. Nous ne les recevons jamais.
- **Hemmia à la maison est ton propre système.** Celui qui gère un hub décide de ce qui s’y passe ; nous ne l’exploitons pas et ne pouvons pas voir dedans.
- **Sur le téléphone seul, tu choisis un fournisseur d’IA** (Anthropic ou OpenAI) et utilises ta propre clé. L’app te demande d’abord ton autorisation ; tes messages vont ensuite de ton téléphone à ce fournisseur, sous ton propre compte chez lui, pas par nous.
- **Hemmia Connect** transmet des connexions chiffrées entre tes téléphones et ton hub. Nous ne les lisons pas ; pour le faire, nous devrions modifier le logiciel que nous faisons tourner ou obtenir un certificat qui apparaît dans des journaux publics (section 4). Pour fonctionner, il garde un identifiant aléatoire du hub, un volume de données mensuel, des jetons d’appareil pour les notifications (chiffrés) et des adresses IP raccourcies (dans les journaux pendant 14 jours ; celle de l’enregistrement du hub tant que le hub est enregistré).
- **La vérification des mises à jour** ne nous communique qu’un numéro de version, Mac ou Docker, et le canal de publication. Nous les comptons par jour ; nous ne stockons pas ton adresse IP. La **liste quotidienne des modèles** ne nous apprend rien sur ton hub ; nous ne comptons pas ces demandes et ne stockons pas ton adresse IP.
- **Pas de publicité, pas de pistage, pas de statistiques d’audience**, pas de vente ni de partage de données à des fins de marketing, pas de profilage, pas d’entraînement de modèles d’IA avec tes données.

Le reste de cette politique donne les détails exigés par la loi fédérale suisse sur la protection des données (LPD) et le règlement général européen sur la protection des données (RGPD).
<!-- /note -->

## Sommaire

1. Qui est responsable
2. Comment Hemmia est construit, et qui est responsable de quoi
3. L’app Hemmia sur ton téléphone
4. Hemmia Connect (notre relais)
5. Notifications
6. La vérification des mises à jour
7. Certificats pour l’adresse de ton hub
8. Ce que nous ne faisons jamais
9. Autorisations du téléphone
10. Qui d’autre reçoit des données
11. Pays vers lesquels vont les données
12. Combien de temps nous gardons les données
13. Tes droits
14. Enfants et adolescents
15. Sécurité
16. Ce site, les questions et la bêta
17. Modifications de cette politique

## 1. Qui est responsable

Le responsable du traitement décrit dans cette politique est :

Andreas Kalkum\
Burgstrasse 21\
5634 Merenschwand\
Suisse\
E-mail : andreas.apps@icloud.com

Hemmia est fait par une seule personne ; il n’y a donc pas de délégué à la protection des données distinct. Écris à l’adresse ci-dessus pour toute question ou demande sur la protection des données, en français, anglais, allemand ou italien.

## 2. Comment Hemmia est construit, et qui est responsable de quoi

Hemmia comprend trois parties, et la responsabilité suit celui qui les exploite :

- **Le hub Hemmia** est un logiciel que tu installes sur ton propre ordinateur (un Mac, ou n’importe quel ordinateur avec Docker). Il stocke les comptes, discussions, photos, documents et réglages de ta famille sur cet ordinateur, chiffrés par personne. **Nous n’exploitons pas ton hub et n’y avons aucun accès.** La personne qui gère un hub (l’« admin ») est responsable des données personnelles des personnes qui l’utilisent, par exemple des membres de la famille qu’elle invite. Lorsque le hub utilise un modèle d’IA cloud, cherche sur le web, ouvre une page web, télécharge un modèle ou envoie une notification à un navigateur, il le fait depuis cet ordinateur, pour le compte de l’admin, selon les réglages qu’il choisit. Cette politique décrit le logiciel pour que tu saches ce qu’il fait ; ce n’est pas une promesse sur la façon dont un admin particulier gère son hub.
- **L’app Hemmia** tourne sur ton téléphone. Elle se connecte soit à un hub (section 3.1), soit fonctionne seule avec un fournisseur d’IA que tu choisis (section 3.2).
- **Nos services** : Hemmia Connect (section 4), les notifications via le relais (section 5), la vérification des mises à jour (section 6) et ce site (section 16). Pour ceux-ci, nous sommes le responsable du traitement.

## 3. L’app Hemmia sur ton téléphone

### 3.1 Avec un hub

Quand tu connectes l’app à un hub (en scannant un code ou en ouvrant un lien), l’app affiche les pages de ce hub. Tes messages, photos et documents vont de ton téléphone au hub, chiffrés (HTTPS), soit directement (à la maison, ou via Tailscale), soit via Hemmia Connect (section 4). L’app stocke sur ton téléphone : la liste des hubs que tu as ajoutés, ta connexion (un cookie de session pour chaque hub) et tes réglages. Rien de cela ne nous est envoyé.

### 3.2 Seule (« Juste moi, sur ce téléphone »)

Tu choisis Anthropic ou OpenAI et colles une clé API de ton propre compte chez ce fournisseur.

- **Ta clé** est stockée dans le trousseau sécurisé de ton téléphone. Elle ne nous est jamais envoyée. L’app ne l’utilise que pour communiquer avec le fournisseur que tu as choisi.
- **Avant tout envoi**, l’app te demande ton autorisation explicite : ce que tu écris, et les photos que tu ajoutes, sont envoyés à ce fournisseur pour obtenir des réponses. Si tu refuses, rien n’est envoyé et l’app ne peut pas répondre.
- **Tes discussions** sont stockées sur ton téléphone, chiffrées. Quand tu envoies un message, l’app envoie la conversation jusqu’ici (avec ses photos éventuelles) directement de ton téléphone au fournisseur. Ce traitement relève de **ton propre contrat** avec ce fournisseur (ses conditions pour les clients API) et de **sa politique de confidentialité** ; nous ne recevons pas ces données et n’y avons aucun accès. Anthropic : anthropic.com/legal/privacy. OpenAI : openai.com/policies/privacy-policy. Leurs conditions pour les clients API indiquent aussi combien de temps ils gardent ce qui leur est envoyé.
- **Exporter et supprimer :** tu peux exporter tes discussions dans un fichier sur ton téléphone, et tout supprimer dans les réglages de l’app.

Base juridique de ce que fait l’app sur ton téléphone : la fourniture de l’app que tu as choisi d’utiliser (art. 6, par. 1, let. b RGPD). Envoi de tes messages au fournisseur : ton consentement (art. 6, par. 1, let. a RGPD), que tu peux retirer en supprimant la clé ou l’app.

### 3.3 Ce que l’app stocke sur ton téléphone

La liste des hubs, les connexions, les réglages, ta clé API et la clé qui chiffre tes discussions sur le téléphone sont stockés sur ton téléphone parce que les fonctions que tu utilises en ont besoin (art. 6, par. 1, let. b RGPD, et l’exception pour le stockage strictement nécessaire selon les règles européennes ePrivacy et l’art. 45c de la loi suisse sur les télécommunications). Supprimer l’app les supprime.

## 4. Hemmia Connect (notre relais)

Hemmia Connect permet à tes téléphones de joindre ton hub de partout, sans ouvrir ton routeur. L’admin l’active dans les réglages du hub. Notre serveur relais est hébergé par Oracle Cloud Infrastructure à Zurich, en Suisse.

**Ce que le relais ne peut pas voir.** La connexion entre ton téléphone et ton hub est chiffrée de bout en bout (TLS). La clé privée du certificat n’existe que sur ton hub. Le relais transmet les données chiffrées sans pouvoir les lire : ni messages, ni phrases de passe, ni photos, ni documents. Comme nous gérons le domaine, nous pourrions en théorie obtenir un autre certificat pour l’adresse de ton hub ; chaque certificat est publié dans des journaux publics de Certificate Transparency, cela ne pourrait donc pas passer inaperçu, et nous ne le faisons pas. Nous gérons aussi la page d’accueil des liens (ci-dessous) et le logiciel du relais lui-même : des versions modifiées pourraient lire les codes contenus dans les liens partagés, sans laisser de trace publique. Nous ne le faisons pas non plus, le code source du relais est public, et les liens de connexion ne fonctionnent qu’une fois et seulement pendant 10 minutes. Si tu préfères ne pas du tout dépendre de nous, utilise Tailscale (section 3.1).

**Ce que le relais traite, et pourquoi :**

| Données | Finalité | Base juridique |
| --- | --- | --- |
| L’identifiant aléatoire de ton hub (12 caractères, p. ex. `k7m2pq9xz4hr`) et sa clé publique | Donner à ton hub son adresse (`<id>.h.hemmia.app`) et le reconnaître | Contrat avec l’admin (art. 6, par. 1, let. b RGPD) |
| L’adresse IP lors de l’enregistrement, raccourcie (dernière partie supprimée, p. ex. `203.0.113.0/24`), et les dates d’enregistrement et de dernière connexion | Limiter les abus (enregistrements par réseau) et supprimer les hubs inutilisés | Intérêt légitime à un service sûr (art. 6, par. 1, let. f RGPD) |
| Pour chaque connexion à un hub : l’adresse IP de l’appareil qui se connecte, l’adresse du hub, l’heure et le volume de données | Nécessairement traités pour transmettre la connexion. L’adresse IP complète est aussi transmise à ton hub, pour qu’il puisse limiter les tentatives de connexion ; ce que le hub en fait dépend de son admin (section 2). Seuls l’adresse IP raccourcie, l’identifiant du hub, le volume et la durée sont inscrits dans nos journaux | Intérêt légitime à fournir et sécuriser la connexion demandée par l’admin (art. 6, par. 1, let. f RGPD) ; contrat avec l’admin |
| L’adresse IP de ton hub pendant qu’il est connecté | Utilisée seulement pour maintenir la connexion et répondre aux demandes du hub ; non stockée | Contrat avec l’admin |
| Le volume de données par hub et par mois | Appliquer la limite mensuelle (20 Go par hub) | Contrat avec l’admin |
| Demandes de certificat (elles ne contiennent que l’adresse du hub) | Obtenir le certificat du hub (section 7) | Contrat avec l’admin |

Le relais n’enregistre pas qui utilise un hub, quelles pages sont ouvertes ni ce qui est dit.

**La page d’accueil des liens** (`join.hemmia.app`). Les liens d’invitation et de connexion que tu partages s’ouvrent sur cette page, qui les transmet à l’app ou à ton hub. Le code d’un lien reste dans la partie de l’adresse après `#`, que les navigateurs n’envoient pas au serveur ; la page le transmet dans ton navigateur. Pour livrer la page, notre serveur traite ton adresse IP, qu’il ne garde qu’en mémoire pour limiter les requêtes et qu’il ne consigne pas. Base juridique : notre intérêt légitime à transmettre les liens de façon sûre (art. 6, par. 1, let. f RGPD).

**Désactiver Connect ou oublier l’adresse.** Désactiver Connect arrête toutes les connexions. **Oublier cette adresse** dans les réglages du hub supprime l’enregistrement du hub sur le relais. Un hub qui ne s’est pas connecté pendant 12 mois est supprimé automatiquement.

**Blocage.** Si un hub enfreint les conditions d’utilisation, par exemple pour mettre à disposition autre chose que Hemmia, nous pouvons le bloquer (voir les conditions d’utilisation). L’enregistrement d’un hub bloqué (identifiant, clé publique, adresse IP raccourcie et dates), une brève raison et la date du blocage sont gardés pour que la même clé ne puisse pas s’enregistrer à nouveau. Nous réexaminons les blocages au moins une fois par an.

## 5. Notifications

Les notifications t’indiquent qu’une réponse ou une image est prête, ou que c’est l’heure de ton aperçu du matin. Elles ne contiennent jamais tes discussions : le texte que tu vois (« Ta réponse est prête ») vient de l’app ou du navigateur lui-même.

- **Dans un navigateur** (Hemmia ajouté à l’écran d’accueil) : le hub envoie la notification directement au service push de ton navigateur (par exemple celui d’Apple pour Safari). C’est un traitement du hub (section 2), pas le nôtre.
- **Dans l’app iPhone** avec un hub qui utilise Connect : iOS donne à l’app un jeton d’appareil. L’app l’envoie à ton hub, et le hub l’enregistre sur notre relais. Le relais le stocke **chiffré**, avec la plateforme et les dates de création et de dernière utilisation, et ne donne au hub en retour qu’un identifiant aléatoire. Quand le hub veut te notifier, le relais envoie au service de notifications push d’Apple le jeton d’appareil, le type de notification (par exemple « réponse »), l’adresse de ton hub (pour que l’app sache quel hub ouvrir) et une référence opaque que seul ton hub peut résoudre. Pour limiter les abus, le relais garde une liste des notifications récentes par hub (identifiant du hub, empreinte de l’identifiant, heure) pendant un jour.

Base juridique : la fourniture des notifications que tu as activées (art. 6, par. 1, let. b RGPD). L’autorisation iOS, que tu peux retirer à tout moment dans les Réglages d’iOS, décide si elles s’affichent.

Hemmia n’est pas encore disponible sur Android. Avant la sortie de l’app Android, Google (Firebase Cloud Messaging), qui en livrerait les notifications, sera ajouté à cette politique.

## 6. La vérification des mises à jour

Les hubs installés avec notre paquet Mac ou notre image Docker vérifient une fois par jour s’il existe une version plus récente. La demande va à notre relais et ne contient que la version du hub (par exemple `0.1.0`), la plateforme (`mac` ou `docker`) et le canal (`stable` ou `beta`). Notre serveur compte ces demandes par jour, version, plateforme et canal. Il n’utilise ton adresse IP qu’en mémoire, pour compter une adresse au maximum trois fois par jour, et ne la stocke ni ne la consigne jamais. La réponse est signée, donc ton hub n’agit que sur des informations qui viennent vraiment de nous.

Les comptages nous indiquent à peu près combien de hubs font tourner quelle version ; ils ne contiennent aucune donnée personnelle. Base juridique du bref traitement de l’adresse IP : notre intérêt légitime à garder les hubs à jour et à savoir quelles versions sont utilisées (art. 6, par. 1, let. f RGPD). L’admin peut désactiver la vérification ; le hub n’envoie alors rien. Avec Docker : mets `HEMMIA_UPDATE_CHECK=0` dans le fichier `.env` à côté de `compose.yaml` (voir le guide Docker). Sur un Mac, un interrupteur dans les réglages est prévu ; d’ici là, écris-nous et nous t’expliquerons comment la désactiver.

**La liste des modèles.** Une fois par jour, chaque hub connecté à notre relais (pas seulement ceux installés avec notre paquet ou notre image Docker) récupère aussi la liste des modèles que Hemmia propose, pour que l’admin puisse en télécharger de nouveaux et soit averti des nouvelles versions des modèles utilisés par la famille. Cette demande ne contient rien sur le hub : ni version, ni identifiant, ni noms des modèles utilisés. Nous ne la comptons pas et nous ne conservons ni n’enregistrons ton adresse IP. La liste est signée comme les informations de mise à jour. Base juridique du bref traitement de l’adresse IP : notre intérêt légitime à proposer des modèles adaptés et à informer les familles des nouvelles versions (art. 6, par. 1, let. f RGPD). L’admin la désactive dans Réglages → Modèles (« Chercher de nouveaux modèles chaque jour »).

## 7. Certificats pour l’adresse de ton hub

Pour que ton téléphone puisse faire confiance à l’adresse de ton hub, le relais demande à l’autorité de certification Let’s Encrypt (Internet Security Research Group, États-Unis) un certificat pour cette adresse. Pour prouver que l’adresse est la nôtre, le relais place un enregistrement temporaire dans notre DNS chez Cloudflare. Let’s Encrypt publie chaque certificat qu’il émet dans des journaux publics de Certificate Transparency, comme toutes les autorités de certification publiques doivent le faire. L’adresse de ton hub apparaît donc dans ces journaux. Elle se compose d’un identifiant aléatoire et ne dit rien sur toi ; elle n’est liée à ton nom nulle part.

## 8. Ce que nous ne faisons jamais

- Pas de publicité, et pas de logiciel de publicité, de statistiques d’audience ou de pistage dans les apps, le hub ou sur ce site.
- Pas de pistage entre apps ou sites, et pas d’utilisation de l’identifiant publicitaire d’Apple.
- Pas de vente, de location ni de partage de données personnelles à des fins de marketing.
- Pas de profilage ni de décisions automatisées qui te concernent (art. 22 RGPD, art. 21 LPD).
- Pas d’utilisation de tes discussions, photos ou autres contenus pour entraîner des modèles d’IA, ni par nous ni pour notre compte.
- Jamais d’accès à tes discussions : elles ne sont pas sur nos serveurs.

Si tu as choisi dans iOS de partager des données d’analyse avec les développeurs d’apps, Apple peut nous transmettre des rapports de plantage et des statistiques d’utilisation agrégées. Ils ne t’identifient pas. C’est Apple qui le contrôle dans tes réglages iOS, pas l’app. Base juridique : le consentement que tu as donné à Apple dans iOS (art. 6, par. 1, let. a RGPD) et notre intérêt légitime à corriger les erreurs (art. 6, par. 1, let. f RGPD).

## 9. Autorisations du téléphone

| Autorisation | Utilisée pour | Si tu refuses |
| --- | --- | --- |
| Appareil photo | Scanner le code qui connecte l’app à un hub ; prendre des photos que tu ajoutes à une discussion | Colle plutôt le lien ; choisis des photos dans ta photothèque |
| Notifications | Savoir quand une réponse ou une image est prête, et l’aperçu du matin | Ouvre l’app pour voir les nouvelles réponses |

Les photos que tu choisis dans ta photothèque sont données à l’app une par une par iOS. Tu peux modifier ces autorisations à tout moment dans les Réglages d’iOS.

## 10. Qui d’autre reçoit des données

Nous ne transmettons des données qu’aux destinataires suivants, et seulement comme décrit ci-dessus :

| Destinataire | Rôle et données | Lieu |
| --- | --- | --- |
| Oracle (Oracle Cloud Infrastructure) | Sous-traitant qui héberge notre relais (sections 4 à 6) | Zurich, Suisse |
| Cloudflare | Sous-traitant pour le DNS de notre domaine (y compris les enregistrements temporaires de certificat, section 7) et pour l’hébergement de ce site (section 16) : adresses IP et données techniques des requêtes | Réseau mondial, y compris les États-Unis |
| Let’s Encrypt (Internet Security Research Group) | Autorité de certification indépendante : l’adresse de ton hub, publiée dans les journaux de Certificate Transparency | États-Unis |
| Apple | Livre les notifications à l’app iPhone (jeton d’appareil, type de notification, adresse du hub, référence opaque), exploite l’App Store et TestFlight (section 16), en tant que responsable indépendant ; fournit aussi notre service d’e-mail (iCloud Mail), où sont stockés les e-mails échangés avec nous | Monde entier, y compris les États-Unis |
| Anthropic ou OpenAI | Seulement si tu utilises l’app seule et que tu les choisis : tes messages et photos, sous ton propre compte chez eux (section 3.2). Nous ne recevons pas ces données et n’y avons aucun accès ; le fournisseur les traite selon ton contrat avec lui. | États-Unis et ailleurs, selon leurs politiques |

**Outils d’IA.** Nous utilisons des assistants de programmation par IA pour développer Hemmia et déployer des mises à jour sur nos serveurs. Ils ne reçoivent pas les données personnelles décrites dans cette politique : nous lisons nous-mêmes les données du relais, les questions et les e-mails.

Nous pouvons communiquer des données si la loi nous y oblige, par exemple à un tribunal ou à une autorité. Vu le peu de données que nous détenons, il y a généralement très peu de choses que nous pourrions communiquer. Nous ne pouvons jamais communiquer de discussions : nous ne les avons pas.

## 11. Pays vers lesquels vont les données

Notre relais et ses données sont en Suisse. Certains traitements par Cloudflare, Let’s Encrypt et Apple peuvent avoir lieu aux États-Unis. Cloudflare, Inc. et Apple Inc. sont certifiées selon le EU–US Data Privacy Framework et le Swiss–US Data Privacy Framework, que la Commission européenne et le Conseil fédéral suisse ont reconnus comme offrant une protection adéquate ; les conditions de traitement des données de Cloudflare incluent aussi les clauses contractuelles types de l’UE, adaptées pour la Suisse. Let’s Encrypt ne reçoit que l’adresse aléatoire de ton hub, qu’il publie par principe ; ce transfert est nécessaire pour fournir Connect comme l’admin l’a demandé (art. 49, par. 1, let. b RGPD, art. 17, al. 1, let. b LPD).

## 12. Combien de temps nous gardons les données

| Données | Supprimées |
| --- | --- |
| Enregistrement du hub (identifiant, clé publique, adresse IP raccourcie, dates) | Quand l’admin utilise **Oublier cette adresse** ; sinon 12 mois après la dernière connexion du hub. Hubs bloqués : gardés tant que le blocage est nécessaire, réexaminés au moins une fois par an. |
| Volume de données mensuel par hub | Après 3 mois |
| Demandes de certificat | Après 7 jours |
| Jetons d’appareil pour les notifications (chiffrés) | Quand le hub ou l’app les retire, ou après 90 jours sans utilisation |
| Liste des notifications récentes | Après 1 jour |
| Journaux du relais (adresses IP raccourcies, identifiants de hub, volumes) | Après 14 jours au plus tard |
| Questions et avis envoyés via le site ou un hub (section 16) | Après 12 mois |
| E-mails échangés avec nous | Quand l’affaire est réglée, et au plus tard après 12 mois, sauf obligation légale de les garder |
| Données des testeurs bêta issues de TestFlight (section 16) | Quand la bêta se termine ou que tu la quittes |
| Comptages de la vérification des mises à jour | Gardés ; ils ne contiennent aucune donnée personnelle |
| Contenu des connexions passant par le relais | Jamais stocké |
| Tout ce qui est sur ton hub ou ton téléphone | Sous ton contrôle ; nous n’en avons aucune copie |

La base de données du relais est sauvegardée chaque nuit, sur le serveur du relais (gardée 7 jours) et sur un ordinateur à nous en Suisse (gardée 30 jours). Des données supprimées peuvent rester dans une sauvegarde jusqu’à 30 jours avant d’être écrasées. Les sauvegardes ne sont lisibles que par nous.

## 13. Tes droits

Selon le RGPD et la LPD suisse, tu as le droit :

- d’accéder aux données personnelles que nous détenons sur toi (art. 15 RGPD, art. 25 LPD) ;
- de faire rectifier des données inexactes (art. 16 RGPD, art. 32 LPD) ;
- de faire effacer tes données (art. 17 RGPD, art. 32 LPD) ;
- de faire limiter le traitement (art. 18 RGPD) ;
- de recevoir tes données dans un format portable (art. 20 RGPD, art. 28 LPD) ;
- de retirer ton consentement à tout moment pour l’avenir, par exemple en supprimant ta clé dans l’app (section 3.2) (art. 7, par. 3 RGPD) ;
- d’introduire une réclamation auprès d’une autorité de contrôle de la protection des données. En Suisse, il s’agit du Préposé fédéral à la protection des données et à la transparence (PFPDT, edoeb.admin.ch). Dans l’UE, il s’agit de l’autorité du pays où tu vis ou travailles, ou de celui où une violation présumée a eu lieu.

**Droit d’opposition (art. 21 RGPD) :** lorsque nous traitons tes données sur la base de nos intérêts légitimes (sections 4, 6, 8 et 16), tu peux t’y opposer à tout moment pour des raisons tenant à ta situation particulière. Nous arrêtons alors, sauf si nous pouvons démontrer des motifs légitimes impérieux qui prévalent sur tes intérêts, droits et libertés, ou si le traitement sert à la constatation, à l’exercice ou à la défense de droits en justice.

Écris à andreas.apps@icloud.com pour exercer ces droits. Nous répondons au plus tard dans un délai d’un mois (30 jours selon la LPD). L’exercice de tes droits est gratuit.

**Une remarque pratique :** comme Hemmia n’a pas de comptes chez nous, un e-mail ne nous dit pas quelles données sont les tiennes. Pour Connect, l’admin de ton hub peut voir l’adresse du hub dans **Réglages → Système** ; envoie-nous cette adresse et nous pourrons retrouver ses données. Le plus rapide pour les supprimer est **Oublier cette adresse** au même endroit. Si nous ne pouvons pas t’identifier avec une certitude raisonnable, nous te le dirons (art. 11 et 12, par. 2 RGPD). Nous ne demanderons jamais plus de données personnelles que nécessaire pour cela.

Pour les données sur un hub, adresse-toi à la personne qui le gère : c’est elle qui les détient, pas nous. Toute personne ayant un compte sur un hub peut le supprimer, avec tout son contenu, dans **Réglages → Compte → Supprimer le compte** ; un admin peut supprimer les comptes des autres dans **Réglages → Famille**. Pour les données que tu as envoyées à Anthropic ou OpenAI, adresse-toi à ce fournisseur.

## 14. Enfants et adolescents

L’app Hemmia est destinée aux personnes de 13 ans et plus. Sur un hub, l’admin décide qui reçoit un compte et peut créer des comptes ados, qui ne voient que les modèles autorisés par l’admin, cherchent sur le web avec un SafeSearch strict ou pas du tout, et ne peuvent pas créer d’images. Les parents sont responsables de l’utilisation par leurs enfants d’un hub qu’ils gèrent. Utiliser l’app seule nécessite un compte chez Anthropic ou OpenAI, dont les propres règles d’âge s’appliquent. Anthropic, par exemple, exige que ses clients API aient au moins 18 ans ; seule, l’app est donc en pratique réservée aux adultes ; les adolescents peuvent utiliser un hub géré par un parent. Si tu n’as pas l’âge à partir duquel tu peux consentir toi-même au traitement de tes données dans ton pays (dans l’UE entre 13 et 16 ans, selon le pays), utilise Hemmia seulement avec l’autorisation d’un parent ou d’un tuteur. Hemmia ne s’adresse pas aux enfants de moins de 13 ans. Les parents qui pensent que leur enfant de moins de 13 ans utilise l’app seul peuvent tout supprimer dans les réglages de l’app ou nous contacter.

## 15. Sécurité

Nous protégeons les données par des mesures techniques et organisationnelles adaptées au risque, notamment :

- le chiffrement en transit de toutes les connexions (TLS), et le chiffrement de bout en bout entre ton téléphone et ton hub via le relais ;
- le chiffrement au repos : les discussions sur un hub sont chiffrées avec une clé que seule la phrase de passe de la personne (ou son code de récupération) déverrouille ; dans l’app, elles sont chiffrées sur le téléphone ; les jetons d’appareil sur le relais sont chiffrés ;
- les appareils doivent être associés à un hub avant de pouvoir le joindre via le relais ;
- des adresses IP raccourcies dans les journaux, des durées de conservation courtes et une suppression automatique ;
- des informations de mise à jour signées, pour qu’un hub ne fasse confiance qu’à ce que nous avons publié ;
- des limites de débit et la possibilité de bloquer les hubs qui abusent du relais.

Aucun système n’est totalement sûr. Si une violation de données est susceptible de te mettre en danger, nous informerons les autorités compétentes et, si nécessaire, toi-même.

## 16. Ce site, les questions et la bêta

Ce site n’utilise ni cookies, ni statistiques d’audience, ni pistage, ni polices ou scripts chargés depuis l’extérieur. Il est hébergé par Cloudflare (Cloudflare Pages). Pour livrer les pages, Cloudflare traite nécessairement ton adresse IP et les données techniques envoyées par ton navigateur, comme le type de navigateur et la page demandée, et peut les garder dans des journaux de courte durée pour la sécurité. Nous ne recevons ni n’analysons de journaux d’accès. Base juridique : notre intérêt légitime à livrer le site de façon sûre (art. 6, par. 1, let. f RGPD). Si tu nous écris un e-mail, nous utilisons ton adresse e-mail et ton message uniquement pour te répondre ou traiter ton signalement, et nous les supprimons quand l’affaire est réglée, sauf obligation légale de les garder. Base juridique : notre intérêt légitime à te répondre et à traiter les signalements (art. 6, par. 1, let. f RGPD), ou des démarches que tu demandes dans le cadre d’un contrat (art. 6, par. 1, let. b RGPD). Les e-mails sont gardés au maximum 12 mois après le règlement de l’affaire.

**Questions et avis.** Sur les pages d’installation de ce site et dans les étapes de configuration d’un hub, tu peux nous envoyer une question ou un avis. Nous recevons ton message, une adresse e-mail si tu en ajoutes une (seulement pour pouvoir répondre), la langue, la page ou l’étape de configuration d’où il a été envoyé et, depuis un hub, la version du hub (pas son identifiant ni ton compte). Il est stocké sur notre relais en Suisse, nous est envoyé une fois par jour par e-mail (section 10, Apple) et supprimé après 12 mois. Ton adresse IP n’est utilisée qu’en mémoire pour limiter le nombre de messages qu’une adresse peut envoyer, et n’est pas stockée. Base juridique : notre intérêt légitime à répondre aux questions et à améliorer Hemmia (art. 6, par. 1, let. f RGPD). Merci de ne pas y mettre de données personnelles que tu ne veux pas nous confier.

**La bêta (TestFlight).** Si tu testes l’app iPhone avant sa sortie, tu le fais via TestFlight d’Apple. Soit tu nous demandes par e-mail d’être invité, soit tu rejoins la bêta par un lien public. Apple nous communique alors ton nom et ton adresse e-mail (si tu as été invité par e-mail), ton modèle d’appareil, ta version d’iOS, quand tu as installé et utilisé la version de test, les rapports de plantage, et les avis et captures d’écran que tu choisis d’envoyer via TestFlight. Nous ne les utilisons que pour mener la bêta et corriger les problèmes. Base juridique : les démarches que tu as demandées en rejoignant la bêta (art. 6, par. 1, let. b RGPD). Apple traite ces données en tant que responsable indépendant selon ses propres conditions. Nous les supprimons quand la bêta se termine ou quand tu la quittes.

## 17. Modifications de cette politique

Si nous changeons la façon dont Hemmia traite les données, nous mettrons à jour cette politique et la date en haut. Les changements importants seront annoncés sur hemmia.app, et lorsque c’est possible aussi dans l’app ou le hub, avant leur entrée en vigueur. Quand Hemmia Connect sera proposé comme service payant, le prestataire de paiement et ce qu’il traite seront ajoutés ici avant la première vente. La version actuelle se trouve toujours sur hemmia.app/fr/legal/privacy/, en anglais sur hemmia.app/legal/privacy/, en allemand sur hemmia.app/de/legal/privacy/ et en italien sur hemmia.app/it/legal/privacy/. Toutes disent la même chose.
