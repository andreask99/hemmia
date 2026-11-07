---
title: Datenschutz und Sicherheit, einfach erklärt
description: Was auf deinen Geräten bleibt, was an einen KI-Anbieter geht, was unser Relay sieht und was diese Website sammelt (nichts).
nav: privacy
order: 20
---

# Datenschutz und Sicherheit, einfach erklärt

Auf dieser Seite steht in einfachen Worten, was mit deinen Daten passiert. Die technischen Einzelheiten stehen im Sicherheitskonzept, das mit dem Quellcode veröffentlicht ist.

## Was auf deinen Geräten bleibt

- **Zu Hause:** Deine Chats, Fotos und Dokumente liegen auf deinem Hub. Die Inhalte jeder Person sind mit einem Schlüssel verschlüsselt, der aus ihrer eigenen Passphrase entsteht. Andere in der Familie können sie nicht lesen, auch nicht, wer den Hub betreut. Wenn du deine Passphrase vergisst, kommst du mit deinem Wiederherstellungscode wieder hinein.
- **Auf dem Telefon:** Deine Chats und Fotos liegen in der App, verschlüsselt mit einem Schlüssel, den nur der sichere Speicher des Telefons kennt.
- Es gibt kein Hemmia-Konto und keinen Server von uns, der deine Chats aufbewahrt.

## Was an einen KI-Anbieter geht, und wann

- **Lokale Modelle** laufen auf deinem Hub. Was du ihnen schreibst, verlässt dein Zuhause nie.
- **Cloud-Modelle** (Anthropic, OpenAI und andere) bekommen die Nachrichten der Chats, die du mit ihnen führst, denn sie schreiben die Antworten. Das passiert nur mit einem Schlüssel, den du selbst eingetragen hast, und nur bei Chats, in denen du eines dieser Modelle gewählt hast. Auf einem Hub ist dein Schlüssel mit deiner Passphrase verschlüsselt; niemand sonst, auch nicht die Admin-Person, kann ihn sehen oder nutzen. Für das, was der Anbieter erhält, gelten seine eigenen Datenschutzbedingungen.
- Auf dem Telefon spricht die App direkt mit dem Anbieter. Dein Schlüssel liegt im sicheren Speicher des Telefons und wird nur an diesen Anbieter geschickt.

## Was unser Relay sieht (Hemmia Connect)

Wenn du Hemmia Connect einschaltest, erreichen Telefone deinen Hub unterwegs über unser Relay.

- Die Verbindung ist vom Telefon bis zum Hub verschlüsselt. Das Relay leitet sie weiter, hat aber keinen Schlüssel dafür. Es sieht nie deine Nachrichten, Passphrasen, Fotos oder welchen Chat du gerade öffnest.
- Es weiß: die Adresse deines Hubs, wann er zuletzt verbunden war, wie viele Daten diesen Monat durchgingen und, solange eine Verbindung offen ist, die IP-Adresse des Telefons. In den Protokollen stehen IP-Adressen nur gekürzt.
- **Das eine, was es theoretisch könnte:** Wer das Relay betreibt, verwaltet die Adressen unter seiner Domain. Er könnte daher theoretisch ein Zertifikat für die Adresse deines Hubs bekommen und Verbindungen abfangen, solange er das tut. Das ist dasselbe Vertrauen, das du jeder Website und ihrer Verschlüsselung entgegenbringst. Jedes solche Zertifikat wird in öffentlichen Protokollen veröffentlicht und ist dort sichtbar. Wenn du dieses Vertrauen nicht geben möchtest, nutze stattdessen **Tailscale** oder nutze den Hub nur im Browser auf seinem eigenen Computer.

## Benachrichtigungen

Wenn eine Antwort oder ein Bild fertig ist, bekommt dein Telefon eine Benachrichtigung. Sie enthält keinen Inhalt: Der Text, den du siehst („Deine Antwort ist da“), kommt aus der App selbst, und der Verweis auf den Chat ist von deinem Hub verschlüsselt. Weder Apple noch Google noch unser Relay können erkennen, zu welchem Chat sie gehört.

## Update-Prüfung

Einmal am Tag fragt ein Hub, der aus unserem Paket oder Docker-Image installiert wurde, unseren Server, ob es eine neuere Version gibt. Die Anfrage sagt nur, welche Version er hat, ob es die Mac- oder die Docker-Version ist und ob er normale oder Test-Versionen bekommt. Wir zählen diese Anfragen pro Tag und wissen so ungefähr, wie viele Hubs welche Version haben. Deine IP-Adresse speichern wir nicht, und über dich oder deine Familie wird nichts geschickt. Die Antwort ist signiert, damit dein Hub ihr nur vertraut, wenn sie wirklich von uns kommt. Ausschalten lässt sich die Prüfung mit `HEMMIA_UPDATE_CHECK=0` (Docker: in `.env`); ein Schalter in den Einstellungen kommt mit den automatischen Updates.

## Diese Website

Keine Cookies, keine Statistik, keine Zählpixel, keine Schriften oder Skripte von anderen Seiten. Der Server, der die Dateien ausliefert, führt eventuell übliche Zugriffsprotokolle; wir nutzen sie nicht, um jemanden zu verfolgen.

## Open Source

Der Code von Hemmia wird unter der AGPL-Lizenz veröffentlicht, damit alle nachprüfen können, was er tut. Wenn du ein Sicherheitsproblem findest, melde es bitte vertraulich an andreas.apps@icloud.com. Wir beheben es so schnell wie möglich.
