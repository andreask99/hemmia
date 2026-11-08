---
title: Fragen und Antworten
description: Kurze Antworten zu Kosten, Datenschutz, Modellen, dem Relay und Open Source.
nav: faq
order: 90
---

# Fragen und Antworten

## Ist Hemmia kostenlos?

Ja. Die Apps und der Hub sind kostenlos, und es gibt kein Konto bei uns. Das einzige optionale, kostenpflichtige Extra ist Hemmia Connect: Damit erreichen eure Telefone den Hub mit einem Schalter (während der Beta kostenlos). Tailscale macht dasselbe kostenlos, wenn du es selbst einrichtest. Wenn du Cloud-Modelle nutzt, bezahlst du den Anbieter (Anthropic, OpenAI oder OpenRouter) direkt für das, was du verbrauchst. Lokale Modelle auf deinem Hub kosten nur Strom.

## Was kosten Cloud-Modelle?

Das hängt davon ab, wie viel du schreibst und welches Modell du wählst. Ein normaler Tag mit Chatten kostet ein paar Cent. Bei den Anbietern kannst du ein monatliches Ausgabenlimit festlegen; das empfehlen wir.

## Seht ihr meine Chats?

Nein. Deine Chats liegen verschlüsselt auf deinem Hub oder deinem Telefon. Wir betreiben keinen Server, der sie aufbewahrt, und unser Relay kann den Verkehr, den es weiterleitet, nicht lesen. Mehr unter [Datenschutz, einfach erklärt](/de/privacy/).

## Welche KI-Modelle kann ich nutzen?

Auf einem Hub: lokale Modelle über Ollama oder LM Studio und Cloud-Modelle von Anthropic, OpenAI und OpenRouter mit einem Schlüssel. Nur auf dem Telefon: Anthropic und OpenAI mit deinem eigenen Schlüssel. Du kannst für jeden Chat ein anderes Modell wählen.

## Wie gut sind lokale Modelle?

Gut für Alltagsfragen, Texte und Zusammenfassungen, und alles bleibt zu Hause. Die besten Cloud-Modelle sind bei schwierigen Aufgaben noch schneller und stärker. Hemmia empfiehlt lokale Modelle, die zum Arbeitsspeicher deines Computers passen.

## Welchen Computer brauche ich für einen Hub?

Einen Mac mit Apple-Chip (für lokale Modelle am besten mit 16 GB Arbeitsspeicher oder mehr) oder einen Computer, auf dem Docker läuft, etwa einen PC oder ein NAS. Wenn du nur Cloud-Modelle nutzt, reicht ein kleiner Computer. Er muss eingeschaltet bleiben.

## Wozu gibt es ein Relay?

Damit dein Telefon deinen Hub erreicht, zu Hause und unterwegs, ohne dass du deinen Router öffnen oder etwas einrichten musst. Das Relay leitet nur verschlüsselten Verkehr weiter. Wenn du magst, nimm stattdessen Tailscale.

## Können meine Kinder Hemmia nutzen?

Ja. Jede Person hat ihr eigenes Konto und ihre eigenen privaten Chats. Admins können Konten einschränken, zum Beispiel die Websuche abschalten.

## Was passiert, wenn ich meine Passphrase verliere?

Nimm deinen Wiederherstellungscode, den du beim Anlegen deines Kontos gespeichert hast. Ohne Passphrase und Wiederherstellungscode kann niemand deine Chats öffnen, auch nicht, wer den Hub betreibt.

## Ist Hemmia Open Source?

Ja. Der Code liegt [auf GitHub](https://github.com/andreask99/hemmia), unter der AGPL-Lizenz, damit alle nachprüfen können, was er tut und wie er deine Daten schützt.
