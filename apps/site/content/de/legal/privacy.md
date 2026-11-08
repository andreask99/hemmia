---
title: Datenschutzerklärung
description: Wie die Hemmia-Apps, Hemmia Connect, die Update-Prüfung und diese Website mit Personendaten umgehen, nach dem Schweizer DSG und der EU-DSGVO.
nav: legal
order: 900
date: 2026-11-08
---

# Datenschutzerklärung

Stand: 8. November 2026 · Gilt für die Hemmia-Apps, die Hemmia-Hub-Software, wie wir sie verteilen, Hemmia Connect (unser Relay), die Update-Prüfung und diese Website (hemmia.app).

<!-- note -->
**Das Wichtigste in Kürze**

- **Kein Konto bei uns.** Du meldest dich nie bei uns an, um Hemmia zu nutzen. Wir fragen nicht nach deinem Namen, deiner E-Mail-Adresse oder Telefonnummer.
- **Deine Chats liegen nicht bei uns.** Sie liegen verschlüsselt auf deinem eigenen Hemmia-Hub (einem Computer zu Hause) oder auf deinem Telefon. Wir bekommen sie nie.
- **Hemmia zu Hause ist dein eigenes System.** Wer einen Hub betreibt, entscheidet, was darauf passiert; wir betreiben ihn nicht und können nicht hineinsehen.
- **Nur auf dem Telefon wählst du einen KI-Anbieter** (Anthropic oder OpenAI) und nutzt deinen eigenen Schlüssel. Die App fragt dich vorher um Erlaubnis; deine Nachrichten gehen dann direkt vom Telefon an diesen Anbieter, unter deinem eigenen Konto dort, nicht über uns.
- **Hemmia Connect** leitet verschlüsselte Verbindungen zwischen deinen Telefonen und deinem Hub weiter. Wir lesen sie nicht und könnten es nicht, ohne eine öffentliche Spur zu hinterlassen (Abschnitt 4). Dafür speichert es eine zufällige Hub-ID, eine monatliche Datenmenge, Mitteilungsadressen (verschlüsselt) und gekürzte IP-Adressen in Protokollen für 14 Tage.
- **Die Update-Prüfung** teilt uns nur eine Versionsnummer, Mac oder Docker und den Update-Kanal mit. Wir zählen das pro Tag; deine IP-Adresse speichern wir nicht.
- **Keine Werbung, kein Tracking, keine Analyse**, kein Verkauf oder Weitergeben von Daten für Werbung, kein Profiling, kein Training von KI-Modellen mit deinen Daten.

Der Rest dieser Erklärung gibt die Einzelheiten an, wie es das Schweizer Datenschutzgesetz (DSG) und die EU-Datenschutz-Grundverordnung (DSGVO) verlangen.
<!-- /note -->

## Inhalt

1. Wer verantwortlich ist
2. Wie Hemmia aufgebaut ist und wer wofür verantwortlich ist
3. Die Hemmia-App auf deinem Telefon
4. Hemmia Connect (unser Relay)
5. Mitteilungen
6. Die Update-Prüfung
7. Zertifikate für die Adresse deines Hubs
8. Was wir nie tun
9. Berechtigungen auf dem Telefon
10. Wer sonst Daten erhält
11. In welche Länder Daten gehen
12. Wie lange wir Daten aufbewahren
13. Deine Rechte
14. Kinder und Jugendliche
15. Sicherheit
16. Diese Website
17. Änderungen dieser Erklärung

## 1. Wer verantwortlich ist

Verantwortlich für die in dieser Erklärung beschriebene Bearbeitung ist:

Andreas Kalkum\
Burgstrasse 21\
5634 Merenschwand\
Schweiz\
E-Mail: andreas.apps@icloud.com

Hemmia wird von einer Person gemacht; es gibt deshalb keinen separaten Datenschutzberater oder Datenschutzbeauftragten. Schreib mit jeder Datenschutzfrage oder Anfrage an die Adresse oben, auf Deutsch, Englisch, Französisch oder Italienisch.

## 2. Wie Hemmia aufgebaut ist und wer wofür verantwortlich ist

Hemmia besteht aus drei Teilen, und die Verantwortung richtet sich danach, wer sie betreibt:

- **Der Hemmia-Hub** ist Software, die du auf deinem eigenen Computer installierst (einem Mac oder einem Computer mit Docker). Er speichert die Konten, Chats, Fotos, Dokumente und Einstellungen deiner Familie auf diesem Computer, pro Person verschlüsselt. **Wir betreiben deinen Hub nicht und haben keinen Zugriff darauf.** Wer einen Hub betreibt (der „Admin“), ist für die Personendaten der Menschen verantwortlich, die ihn nutzen, zum Beispiel der eingeladenen Familienmitglieder. Nutzt der Hub ein Cloud-KI-Modell, sucht oder öffnet er Webseiten, lädt er ein Modell herunter oder schickt er eine Mitteilung an einen Browser, tut er das von diesem Computer aus, im Auftrag des Admins und nach dessen Einstellungen. Diese Erklärung beschreibt die Software, damit du weisst, was sie tut; sie ist kein Versprechen darüber, wie ein bestimmter Admin seinen Hub betreibt.
- **Die Hemmia-App** läuft auf deinem Telefon. Sie verbindet sich entweder mit einem Hub (Abschnitt 3.1) oder arbeitet allein mit einem KI-Anbieter deiner Wahl (Abschnitt 3.2).
- **Unsere Dienste**: Hemmia Connect (Abschnitt 4), Mitteilungen über das Relay (Abschnitt 5), die Update-Prüfung (Abschnitt 6) und diese Website (Abschnitt 16). Dafür sind wir verantwortlich.

## 3. Die Hemmia-App auf deinem Telefon

### 3.1 Mit einem Hub

Verbindest du die App mit einem Hub (durch Scannen eines Codes oder Öffnen eines Links), zeigt sie die Seiten dieses Hubs. Deine Nachrichten, Fotos und Dokumente gehen verschlüsselt (HTTPS) vom Telefon an den Hub, entweder direkt (zu Hause oder über Tailscale) oder über Hemmia Connect (Abschnitt 4). Die App speichert auf deinem Telefon: die Liste der hinzugefügten Hubs, deine Anmeldung (ein Sitzungs-Cookie pro Hub) und deine Einstellungen. Nichts davon wird an uns geschickt.

### 3.2 Allein („Nur auf diesem Telefon“)

Du wählst Anthropic oder OpenAI und fügst einen API-Schlüssel aus deinem eigenen Konto bei diesem Anbieter ein.

- **Dein Schlüssel** wird im sicheren Schlüsselbund deines Telefons gespeichert. Er wird nie an uns geschickt. Die App nutzt ihn nur, um mit dem gewählten Anbieter zu sprechen.
- **Bevor etwas gesendet wird**, fragt die App ausdrücklich um deine Erlaubnis: Was du schreibst, und Fotos, die du hinzufügst, werden an diesen Anbieter geschickt, um Antworten zu bekommen. Stimmst du nicht zu, wird nichts gesendet und die App kann nicht antworten.
- **Deine Chats** werden verschlüsselt auf deinem Telefon gespeichert. Schickst du eine Nachricht, sendet die App das bisherige Gespräch (mit allen Fotos darin) direkt von deinem Telefon an den Anbieter. Das ist eine Bearbeitung unter **deinem eigenen Vertrag** mit diesem Anbieter (dessen Bedingungen für API-Kunden) und **dessen Datenschutzerklärung**; wir bekommen diese Daten nicht und haben keinen Zugriff darauf. Anthropic: anthropic.com/legal/privacy. OpenAI: openai.com/policies/privacy-policy. Die Bedingungen für API-Kunden sagen auch, wie lange der Anbieter Gesendetes aufbewahrt.
- **Exportieren und löschen:** Du kannst deine Chats in eine Datei auf deinem Telefon exportieren und in den Einstellungen der App alles löschen.

Rechtsgrundlage für das, was die App auf deinem Telefon tut: die Bereitstellung der App, die du nutzen willst (Art. 6 Abs. 1 lit. b DSGVO). Das Senden deiner Nachrichten an den Anbieter: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du widerrufen kannst, indem du den Schlüssel oder die App löschst.

### 3.3 Was die App auf deinem Telefon speichert

Die Hub-Liste, Anmeldungen, Einstellungen, dein API-Schlüssel und der Schlüssel, der deine Chats auf dem Telefon verschlüsselt, werden auf deinem Telefon gespeichert, weil die Funktionen, die du nutzt, sie brauchen (Art. 6 Abs. 1 lit. b DSGVO sowie die Ausnahme für unbedingt erforderliche Speicherung nach den EU-ePrivacy-Regeln und Art. 45c des Fernmeldegesetzes). Löschst du die App, sind sie weg.

## 4. Hemmia Connect (unser Relay)

Mit Hemmia Connect erreichen deine Telefone deinen Hub von überall, ohne dass du deinen Router öffnen musst. Der Admin schaltet es in den Einstellungen des Hubs ein. Unser Relay-Server wird von Oracle Cloud Infrastructure in Zürich, Schweiz, betrieben.

**Was das Relay nicht sehen kann.** Die Verbindung zwischen deinem Telefon und deinem Hub ist durchgehend verschlüsselt (TLS). Der private Schlüssel des Zertifikats existiert nur auf deinem Hub. Das Relay leitet die verschlüsselten Daten weiter, ohne sie lesen zu können: keine Nachrichten, Passphrasen, Fotos oder Dokumente. Weil wir die Domain verwalten, könnten wir theoretisch ein weiteres Zertifikat für die Adresse deines Hubs bekommen; jedes Zertifikat wird in öffentlichen Certificate-Transparency-Protokollen veröffentlicht, das bliebe also nicht unbemerkt, und wir tun es nicht. Willst du dich darauf nicht verlassen, nutze Tailscale (Abschnitt 3.1).

**Was das Relay bearbeitet, und wozu:**

| Daten | Zweck | Rechtsgrundlage |
| --- | --- | --- |
| Die zufällige ID deines Hubs (12 Zeichen, z. B. `k7m2pq9xz4hr`) und sein öffentlicher Schlüssel | Deinem Hub seine Adresse (`<id>.h.hemmia.app`) geben und ihn wiedererkennen | Vertrag mit dem Admin (Art. 6 Abs. 1 lit. b DSGVO) |
| Die IP-Adresse bei der Registrierung, gekürzt (letzter Teil entfernt, z. B. `203.0.113.0/24`), sowie Zeitpunkt der Registrierung und der letzten Verbindung | Missbrauch begrenzen (Registrierungen pro Netz) und unbenutzte Hubs löschen | Berechtigtes Interesse an einem sicheren Dienst (Art. 6 Abs. 1 lit. f DSGVO) |
| Für jede Verbindung zu einem Hub: die IP-Adresse des verbindenden Geräts, die Adresse des Hubs, die Zeit und die Datenmenge | Notwendig, um die Verbindung weiterzuleiten. Die vollständige IP-Adresse wird auch an deinen Hub weitergegeben, damit er Anmeldeversuche begrenzen kann; was der Hub damit tut, bestimmt sein Admin (Abschnitt 2). In unsere Protokolle geschrieben werden nur die gekürzte IP-Adresse, die Hub-ID, die Datenmenge und die Dauer | Berechtigtes Interesse, die vom Admin gewünschte Verbindung bereitzustellen und abzusichern (Art. 6 Abs. 1 lit. f DSGVO); Vertrag mit dem Admin |
| Die IP-Adresse deines Hubs, solange er verbunden ist | Nur für die Verbindung und die Anfragen des Hubs genutzt, nicht gespeichert | Vertrag mit dem Admin |
| Die Datenmenge pro Hub und Monat | Das Monatslimit anwenden (20 GB pro Hub) | Vertrag mit dem Admin |
| Zertifikatsanfragen (sie enthalten nur die Adresse des Hubs) | Das Zertifikat des Hubs beschaffen (Abschnitt 7) | Vertrag mit dem Admin |

Das Relay hält nicht fest, wer einen Hub nutzt, welche Seiten geöffnet werden oder was gesagt wird.

**Connect ausschalten oder die Adresse vergessen.** Schaltest du Connect aus, enden alle Verbindungen. **Diese Adresse vergessen** in den Einstellungen des Hubs löscht die Registrierung des Hubs auf dem Relay. Ein Hub, der sich 12 Monate nicht verbunden hat, wird automatisch gelöscht.

**Sperren.** Verstösst ein Hub gegen die Nutzungsbedingungen, zum Beispiel indem er etwas anderes als Hemmia bereitstellt, können wir ihn sperren (siehe Nutzungsbedingungen). Die Registrierung eines gesperrten Hubs (ID, öffentlicher Schlüssel, gekürzte IP-Adresse und Zeitpunkte), ein kurzer Grund und der Zeitpunkt der Sperre werden aufbewahrt, damit sich derselbe Schlüssel nicht erneut registrieren kann. Wir überprüfen Sperren mindestens einmal im Jahr.

## 5. Mitteilungen

Mitteilungen sagen dir, dass eine Antwort oder ein Bild fertig ist oder dass es Zeit für deinen Morgenüberblick ist. Sie enthalten nie deine Chats: Der Text, den du siehst („Deine Antwort ist da“), kommt von der App oder vom Browser selbst.

- **Im Browser** (Hemmia auf dem Home-Bildschirm): Der Hub schickt die Mitteilung direkt an den Push-Dienst deines Browsers (zum Beispiel den von Apple für Safari). Das ist eine Bearbeitung des Hubs (Abschnitt 2), nicht unsere.
- **In der iPhone-App** mit einem Hub, der Connect nutzt: iOS gibt der App einen Geräte-Token. Die App schickt ihn an deinen Hub, und der Hub registriert ihn auf unserem Relay. Das Relay speichert ihn **verschlüsselt**, mit der Plattform und den Zeitpunkten der Erstellung und der letzten Nutzung, und gibt dem Hub dafür nur ein zufälliges Kennzeichen zurück. Will der Hub dich benachrichtigen, schickt das Relay dem Apple Push Notification Service den Geräte-Token, die Art der Mitteilung (zum Beispiel „Antwort“), die Adresse deines Hubs (damit die App weiss, welchen Hub sie öffnen soll) und eine undurchsichtige Referenz, die nur dein Hub auflösen kann. Um Missbrauch zu begrenzen, führt das Relay einen Tag lang eine Liste der letzten Mitteilungen pro Hub (Hub-ID, ein Hash des Kennzeichens, die Zeit).

Rechtsgrundlage: die Bereitstellung der Mitteilungen, die du eingeschaltet hast (Art. 6 Abs. 1 lit. b DSGVO). Die iOS-Berechtigung, die du jederzeit in den iOS-Einstellungen widerrufen kannst, entscheidet, ob sie angezeigt werden.

Hemmia gibt es noch nicht für Android. Bevor die Android-App erscheint, ergänzen wir hier Google (Firebase Cloud Messaging), das ihre Mitteilungen zustellen würde.

## 6. Die Update-Prüfung

Hubs, die aus unserem Mac-Paket oder Docker-Image installiert wurden, prüfen einmal am Tag, ob es eine neuere Version gibt. Die Anfrage geht an unser Relay und enthält nur die Version des Hubs (zum Beispiel `0.1.0`), die Plattform (`mac` oder `docker`) und den Kanal (`stable` oder `beta`). Unser Server zählt diese Anfragen pro Tag, Version, Plattform und Kanal. Deine IP-Adresse nutzt er nur im Arbeitsspeicher, um eine Adresse höchstens dreimal am Tag zu zählen, und speichert oder protokolliert sie nie. Die Antwort ist signiert, damit dein Hub nur Informationen verwendet, die wirklich von uns stammen.

Die Zählung zeigt uns ungefähr, wie viele Hubs welche Version nutzen; sie enthält keine Personendaten. Rechtsgrundlage für die kurze Bearbeitung der IP-Adresse: unser berechtigtes Interesse, Hubs aktuell zu halten und zu wissen, welche Versionen im Einsatz sind (Art. 6 Abs. 1 lit. f DSGVO). Der Admin kann die Prüfung ausschalten; der Hub schickt dann nichts. Mit Docker: `HEMMIA_UPDATE_CHECK=0` in die Datei `.env` neben `compose.yaml` schreiben (siehe Docker-Anleitung). Auf dem Mac ist ein Schalter in den Einstellungen geplant; bis dahin schreib uns, dann sagen wir dir, wie du sie ausschaltest.

## 7. Zertifikate für die Adresse deines Hubs

Damit dein Telefon der Adresse deines Hubs vertrauen kann, beantragt das Relay bei der Zertifizierungsstelle Let's Encrypt (Internet Security Research Group, USA) ein Zertifikat für diese Adresse. Um nachzuweisen, dass die Adresse uns gehört, legt das Relay einen vorübergehenden Eintrag in unser DNS bei Cloudflare. Let's Encrypt veröffentlicht jedes ausgestellte Zertifikat in öffentlichen Certificate-Transparency-Protokollen, wie es alle öffentlichen Zertifizierungsstellen müssen. Die Adresse deines Hubs erscheint deshalb in diesen Protokollen. Sie besteht aus einer zufälligen ID und sagt nichts über dich aus; sie ist nirgends mit deinem Namen verknüpft.

## 8. Was wir nie tun

- Keine Werbung und keine Werbe-, Analyse- oder Tracking-Software in den Apps, im Hub oder auf dieser Website.
- Kein Tracking über Apps oder Websites hinweg und keine Nutzung von Apples Werbe-ID.
- Kein Verkaufen, Vermieten oder Weitergeben von Personendaten für Werbung.
- Kein Profiling und keine automatisierten Entscheidungen, die dich betreffen (Art. 22 DSGVO, Art. 21 DSG).
- Keine Nutzung deiner Chats, Fotos oder anderer Inhalte zum Training von KI-Modellen, weder durch uns noch in unserem Auftrag.
- Nie Zugriff auf deine Chats: Sie liegen nicht auf unseren Servern.

Hast du in iOS gewählt, Analysedaten mit App-Entwicklern zu teilen, kann Apple uns Absturzberichte und zusammengefasste Nutzungsstatistiken geben. Diese identifizieren dich nicht. Das steuert Apple in deinen iOS-Einstellungen, nicht die App. Rechtsgrundlage: deine Einwilligung gegenüber Apple in iOS (Art. 6 Abs. 1 lit. a DSGVO) und unser berechtigtes Interesse, Fehler zu beheben (Art. 6 Abs. 1 lit. f DSGVO).

## 9. Berechtigungen auf dem Telefon

| Berechtigung | Wofür | Wenn du ablehnst |
| --- | --- | --- |
| Kamera | Den Code scannen, der die App mit einem Hub verbindet; Fotos aufnehmen, die du einem Chat hinzufügst | Link einfügen; Fotos aus der Mediathek wählen |
| Mitteilungen | Erfahren, wann eine Antwort oder ein Bild fertig ist, und der Morgenüberblick | Die App öffnen, um neue Antworten zu sehen |

Fotos aus deiner Mediathek gibt iOS der App einzeln, wenn du sie auswählst. Du kannst das jederzeit in den iOS-Einstellungen ändern.

## 10. Wer sonst Daten erhält

Wir geben Daten nur an die folgenden Empfänger weiter, und nur wie oben beschrieben:

| Empfänger | Rolle und Daten | Ort |
| --- | --- | --- |
| Oracle (Oracle Cloud Infrastructure) | Auftragsbearbeiter, der unser Relay betreibt (Abschnitte 4–6) | Zürich, Schweiz |
| Cloudflare | Auftragsbearbeiter für das DNS unserer Domain (inklusive der vorübergehenden Zertifikatseinträge, Abschnitt 7) und das Hosting dieser Website (Abschnitt 16): IP-Adressen und technische Anfragedaten | Weltweites Netz, inklusive USA |
| Let's Encrypt (Internet Security Research Group) | Eigenständige Zertifizierungsstelle: die Adresse deines Hubs, veröffentlicht in Certificate-Transparency-Protokollen | USA |
| Apple | Stellt Mitteilungen an die iPhone-App zu (Geräte-Token, Art der Mitteilung, Hub-Adresse, undurchsichtige Referenz) und betreibt den App Store, als eigenständig Verantwortlicher; betreibt ausserdem unser E-Mail-Postfach (iCloud Mail), als unser Auftragsbearbeiter | Weltweit, inklusive USA |
| Anthropic oder OpenAI | Nur wenn du die App allein nutzt und sie wählst: deine Nachrichten und Fotos, unter deinem eigenen Konto dort (Abschnitt 3.2). Wir bekommen diese Daten nicht und haben keinen Zugriff darauf; der Anbieter bearbeitet sie unter deinem Vertrag mit ihm. | USA und anderswo, nach ihren Richtlinien |

Wir können Daten offenlegen, wenn wir gesetzlich dazu verpflichtet sind, zum Beispiel gegenüber einem Gericht oder einer Behörde. Weil wir so wenig haben, gäbe es meist kaum etwas offenzulegen. Chats können wir nie offenlegen: Wir haben sie nicht.

## 11. In welche Länder Daten gehen

Unser Relay und seine Daten sind in der Schweiz. Ein Teil der Bearbeitung durch Cloudflare, Let's Encrypt und Apple kann in den USA stattfinden. Cloudflare, Inc. und Apple Inc. sind unter dem EU-U.S. Data Privacy Framework und dem Swiss-U.S. Data Privacy Framework zertifiziert, die die Europäische Kommission und der Schweizer Bundesrat als angemessenen Schutz anerkannt haben; die Auftragsbearbeitungsbedingungen von Cloudflare enthalten zudem die EU-Standardvertragsklauseln in der für die Schweiz angepassten Fassung. Let's Encrypt erhält nur die zufällige Adresse deines Hubs, die es bestimmungsgemäss veröffentlicht; diese Übermittlung ist nötig, um Connect wie vom Admin gewünscht bereitzustellen (Art. 49 Abs. 1 lit. b DSGVO, Art. 17 Abs. 1 lit. b DSG).

## 12. Wie lange wir Daten aufbewahren

| Daten | Gelöscht |
| --- | --- |
| Registrierung des Hubs (ID, öffentlicher Schlüssel, gekürzte IP-Adresse, Zeitpunkte) | Wenn der Admin **Diese Adresse vergessen** wählt; sonst 12 Monate nach der letzten Verbindung des Hubs. Gesperrte Hubs: so lange die Sperre nötig ist, mindestens einmal im Jahr überprüft. |
| Monatliche Datenmenge pro Hub | Nach 3 Monaten |
| Zertifikatsanfragen | Nach 7 Tagen |
| Geräte-Token für Mitteilungen (verschlüsselt) | Wenn der Hub oder die App sie entfernt, oder nach 90 Tagen ohne Nutzung |
| Liste der letzten Mitteilungen | Nach 1 Tag |
| Relay-Protokolle (gekürzte IP-Adressen, Hub-IDs, Datenmengen) | Spätestens nach 14 Tagen |
| Zählung der Update-Prüfungen | Aufbewahrt; sie enthält keine Personendaten |
| Inhalt der Verbindungen über das Relay | Nie gespeichert |
| Alles auf deinem Hub oder Telefon | In deiner Hand; wir haben keine Kopie |

Die Datenbank des Relays wird jede Nacht gesichert, auf dem Relay-Server (7 Tage aufbewahrt) und auf einem Computer von uns in der Schweiz (30 Tage aufbewahrt). Gelöschte Daten können bis zu 30 Tage in einer Sicherung bleiben, bevor sie überschrieben werden. Sicherungen sind nur für uns lesbar.

## 13. Deine Rechte

Nach der DSGVO und dem Schweizer DSG hast du das Recht,

- Auskunft über die Personendaten zu erhalten, die wir über dich haben (Art. 15 DSGVO, Art. 25 DSG);
- falsche Daten berichtigen zu lassen (Art. 16 DSGVO, Art. 32 DSG);
- deine Daten löschen zu lassen (Art. 17 DSGVO, Art. 32 DSG);
- die Bearbeitung einschränken zu lassen (Art. 18 DSGVO);
- deine Daten in einem übertragbaren Format zu erhalten (Art. 20 DSGVO, Art. 28 DSG);
- eine Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen, zum Beispiel indem du deinen Schlüssel in der App löschst (Abschnitt 3.2) (Art. 7 Abs. 3 DSGVO);
- dich bei einer Datenschutzaufsichtsbehörde zu beschweren. In der Schweiz ist das der Eidgenössische Datenschutz- und Öffentlichkeitsbeauftragte (EDÖB, edoeb.admin.ch). In der EU ist es die Behörde in dem Land, in dem du lebst oder arbeitest oder in dem ein mutmasslicher Verstoss stattfand.

**Widerspruchsrecht (Art. 21 DSGVO):** Wo wir deine Daten auf Grundlage unserer berechtigten Interessen bearbeiten (Abschnitte 4, 6, 8 und 16), kannst du jederzeit aus Gründen, die sich aus deiner besonderen Situation ergeben, widersprechen. Wir hören dann auf, es sei denn, wir können zwingende schutzwürdige Gründe nachweisen, die deine Interessen, Rechte und Freiheiten überwiegen, oder die Bearbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen.

Schreib an andreas.apps@icloud.com, um diese Rechte auszuüben. Wir antworten spätestens innerhalb eines Monats (30 Tage nach DSG). Das Ausüben deiner Rechte ist kostenlos.

**Ein praktischer Hinweis:** Weil Hemmia keine Konten bei uns hat, sagt uns eine E-Mail nicht, welche Einträge zu dir gehören. Für Connect sieht der Admin deines Hubs die Adresse des Hubs unter **Einstellungen → System**; schick uns diese Adresse, dann finden wir die Einträge. Am schnellsten löschst du sie mit **Diese Adresse vergessen** an derselben Stelle. Können wir dich nicht mit hinreichender Sicherheit identifizieren, sagen wir dir das (Art. 11 und 12 Abs. 2 DSGVO). Wir fragen nie nach mehr Personendaten, als dafür nötig ist.

Für Daten auf einem Hub frag die Person, die ihn betreibt: Sie hat die Daten, nicht wir. Für Daten, die du an Anthropic oder OpenAI geschickt hast, frag diesen Anbieter.

## 14. Kinder und Jugendliche

Die Hemmia-App ist für Menschen ab 13 Jahren gedacht. Auf einem Hub entscheidet der Admin, wer ein Konto bekommt, und kann Konten für Jugendliche anlegen, die nur die freigegebenen Modelle sehen, im Web mit strengem Jugendfilter oder gar nicht suchen und keine Bilder erstellen. Eltern sind dafür verantwortlich, wie ihre Kinder einen Hub nutzen, den sie betreiben. Wer die App allein nutzt, braucht ein Konto bei Anthropic oder OpenAI, deren eigene Altersregeln gelten. Anthropic zum Beispiel verlangt, dass API-Kunden mindestens 18 sind; allein ist die App also praktisch für Erwachsene, Jugendliche nutzen einen Hub, den ein Elternteil betreibt. Bist du jünger als das Alter, ab dem du in deinem Land selbst in eine Datenbearbeitung einwilligen darfst (in der EU je nach Land zwischen 13 und 16), nutze Hemmia bitte nur mit der Erlaubnis eines Elternteils oder einer erziehungsberechtigten Person. Hemmia richtet sich nicht an Kinder unter 13. Eltern, die glauben, dass ihr Kind unter 13 die App allein nutzt, können in den Einstellungen der App alles löschen oder uns schreiben.

## 15. Sicherheit

Wir schützen Daten mit technischen und organisatorischen Massnahmen, die dem Risiko angemessen sind, unter anderem:

- Verschlüsselung bei der Übertragung für alle Verbindungen (TLS) und durchgehende Verschlüsselung zwischen deinem Telefon und deinem Hub über das Relay;
- Verschlüsselung bei der Speicherung: Chats auf einem Hub sind mit einem Schlüssel verschlüsselt, den nur die Passphrase (oder der Wiederherstellungscode) der Person freigibt; in der App werden sie auf dem Telefon verschlüsselt; Geräte-Token auf dem Relay sind verschlüsselt;
- Geräte müssen mit einem Hub gekoppelt sein, bevor sie ihn über das Relay erreichen;
- gekürzte IP-Adressen in Protokollen, kurze Aufbewahrung und automatisches Löschen;
- signierte Update-Informationen, damit ein Hub nur vertraut, was wir veröffentlicht haben;
- Begrenzungen der Häufigkeit und die Möglichkeit, Hubs zu sperren, die das Relay missbrauchen.

Kein System ist vollständig sicher. Führt eine Datenschutzverletzung voraussichtlich zu einem Risiko für dich, informieren wir die zuständigen Behörden und, wo nötig, dich.

## 16. Diese Website

Diese Website nutzt keine Cookies, keine Analyse, kein Tracking und keine extern geladenen Schriften oder Skripte. Sie wird von Cloudflare (Cloudflare Pages) gehostet. Um die Seiten auszuliefern, bearbeitet Cloudflare notwendigerweise deine IP-Adresse und die technischen Daten, die dein Browser sendet, etwa den Browsertyp und die aufgerufene Seite, und kann sie zur Sicherheit kurz protokollieren. Wir erhalten und werten keine Zugriffsprotokolle aus. Rechtsgrundlage: unser berechtigtes Interesse, die Website sicher auszuliefern (Art. 6 Abs. 1 lit. f DSGVO). Schreibst du uns eine E-Mail, nutzen wir deine Adresse und Nachricht nur, um dir zu antworten oder deine Meldung zu bearbeiten, und löschen sie, wenn die Sache erledigt ist, sofern wir sie nicht gesetzlich aufbewahren müssen. Rechtsgrundlage: unser berechtigtes Interesse, dir zu antworten und Meldungen zu bearbeiten (Art. 6 Abs. 1 lit. f DSGVO), oder Schritte, um die du im Rahmen eines Vertrags bittest (Art. 6 Abs. 1 lit. b DSGVO).

## 17. Änderungen dieser Erklärung

Ändern wir, wie Hemmia mit Daten umgeht, passen wir diese Erklärung und das Datum oben an. Wesentliche Änderungen kündigen wir in der App oder im Hub an, bevor sie gelten. Wird Hemmia Connect als kostenpflichtiger Dienst angeboten, ergänzen wir den Zahlungsanbieter und was er bearbeitet vor dem ersten Verkauf. Die aktuelle Fassung steht immer unter hemmia.app/de/legal/privacy/, auf Englisch unter hemmia.app/legal/privacy/. Beide sagen dasselbe; weichen sie je voneinander ab, gilt die englische Fassung.
