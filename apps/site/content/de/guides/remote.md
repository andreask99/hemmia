---
title: Unterwegs
description: Deinen Hub mit Hemmia Connect oder Tailscale von deinen Telefonen aus erreichen. Was das Relay sieht und was nicht.
nav: guides
order: 75
draft: true
---

# Unterwegs

Dein Hub antwortet nur auf seinem eigenen Computer. Damit deine Telefone ihn erreichen, zu Hause und unterwegs, wählst du bei der Einrichtung (Schritt **Unterwegs**) oder später unter **Einstellungen → System → Fernzugriff** einen von drei Wegen.

| | Hemmia Connect | Tailscale | Nicht jetzt |
| --- | --- | --- | --- |
| Funktioniert | Überall | Überall | Nur im Browser auf dem Computer des Hubs |
| Auf jedem Telefon | Nichts weiter | Die Tailscale-App und ein Konto | – |
| Wer die Daten weiterleitet | Unser Relay (es kann sie nicht lesen) | Das Netz von Tailscale | – |
| Aufwand | Ein Schalter | Ein paar Schritte, teils im Terminal | Keiner |

## Hemmia Connect

Schalte **Hemmia Connect** ein: bei der Einrichtung mit **Connect einschalten** oder später mit dem Schalter unter **Einstellungen → System → Fernzugriff**. Dein Hub bekommt eine eigene Adresse, und die Telefone erreichen ihn über unser Relay. Connect verhindert außerdem, dass der Computer in den Ruhezustand geht.

Die Verbindung ist vom Telefon bis zu deinem Hub verschlüsselt. Das Relay leitet sie weiter, hat aber keine Schlüssel, um sie zu öffnen: Deine Nachrichten, Passphrasen und Fotos sieht es nie. Auf der [Datenschutzseite](/de/privacy/) steht, was es theoretisch tun könnte und warum die Zertifikatslogs das zeigen würden.

In den Einstellungen siehst du, ob Connect funktioniert, wie lange das Zertifikat des Hubs gilt und wie viele Daten diesen Monat über das Relay gelaufen sind. Mit **Diese Adresse vergessen** gibst du die Adresse auf; Telefone, die über Connect verbunden sind, brauchen dann einen neuen Link.

Jeder Hub kann pro Monat bis zu 20 GB über das Relay schicken; eine Familie braucht meist ein bis drei. Erreicht ein Hub die Grenze doch, erreichen Telefone ihn über Connect erst im nächsten Monat wieder (gezählt in UTC); Tailscale funktioniert weiter.

Funktioniert Connect zehn Minuten lang nicht (das Relay ist ausgefallen oder das Internet zu Hause), bekommen Admins eine Mitteilung, und eine zweite, sobald es wieder geht. Der Hub versucht von selbst, sich wieder zu verbinden.

## Tailscale

Tailscale ist ein privates Netz, das du selbst verwaltest. Jedes Telefon braucht die Tailscale-App und muss im selben Netz angemeldet sein.

<!-- steps -->
## Tailscale auf dem Computer des Hubs installieren
Installiere Tailscale von [tailscale.com](https://tailscale.com) und melde dich an.

## HTTPS-Zertifikate einschalten
Öffne in der Admin-Konsole von Tailscale **DNS** und wähle unter **HTTPS Certificates** **Enable HTTPS**.

## Hemmia mit Tailscale verbinden
Öffne auf dem Mac das Terminal und gib ein:

```sh
"/Library/Application Support/Hemmia/current/packaging/tailscale.sh"
```

Das macht den Hub nur in deinem Tailscale-Netz erreichbar (nie im offenen Internet), startet ihn neu und zeigt seine neue Adresse.

Mit Docker gibst du auf dem Computer `tailscale serve --bg --https=443 http://127.0.0.1:8787` ein, schreibst `HEMMIA_PUBLIC_HOSTNAMES=<name>.ts.net` (der Name aus `tailscale status`) in `.env` neben `compose.yaml` und führst `docker compose up -d` noch einmal aus.

## Telefone hinzufügen
Installiere Tailscale auf jedem Telefon und melde dich im selben Netz an. Verbinde die Telefone dann mit dem Hub wie unter [Telefon verbinden](/de/guides/phone-to-hub/).
<!-- /steps -->

## Nicht jetzt

Ohne Fernzugriff funktioniert Hemmia nur im Browser auf dem Computer des Hubs. Connect oder Tailscale kannst du jederzeit später einrichten.
