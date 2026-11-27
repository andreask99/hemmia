---
title: Informativa sulla privacy
description: Come le app Hemmia, Hemmia Connect, il controllo degli aggiornamenti e questo sito trattano i dati personali, secondo la LPD svizzera e il GDPR europeo.
nav: legal
order: 900
date: 2026-11-21
---

# Informativa sulla privacy

Ultimo aggiornamento: 27 novembre 2026 · Si applica alle app Hemmia, al software dell’hub Hemmia come lo distribuiamo, a Hemmia Connect (il nostro relay), al controllo degli aggiornamenti e a questo sito (hemmia.app).

<!-- note -->
**In breve**

- **Nessun account da noi.** Non ti serve un account da noi per usare Hemmia. Se ci scrivi, ci invii una domanda o partecipi alla beta, riceviamo il tuo indirizzo e-mail (sezione 16).
- **Le tue chat non sono salvate da noi.** Vivono sul tuo hub Hemmia (un computer di casa) o sul tuo telefono, cifrate. Non le riceviamo mai.
- **Hemmia a casa è il tuo sistema.** Chi gestisce un hub decide cosa vi accade; noi non lo gestiamo e non possiamo vederci dentro.
- **Solo sul telefono, scegli un fornitore di IA** (Anthropic o OpenAI) e usi la tua chiave. L’app ti chiede prima il permesso; i tuoi messaggi vanno poi dal telefono a quel fornitore, con il tuo account presso di lui, non tramite noi.
- **Hemmia Connect** inoltra connessioni cifrate tra i tuoi telefoni e il tuo hub. Non le leggiamo; per farlo dovremmo modificare il software che eseguiamo o ottenere un certificato che compare in log pubblici (sezione 4). Per funzionare conserva un ID casuale dell’hub, un volume di dati mensile, token di dispositivo per le notifiche (cifrati) e indirizzi IP accorciati (nei log per 14 giorni; quello della registrazione dell’hub finché l’hub è registrato).
- **Il controllo degli aggiornamenti** ci comunica solo un numero di versione, Mac o Docker, e il canale di rilascio. Li contiamo per giorno; non salviamo il tuo indirizzo IP. L’**elenco quotidiano dei modelli** non ci dice nulla sul tuo hub; non contiamo queste richieste e non salviamo il tuo indirizzo IP.
- **Niente pubblicità, nessun tracciamento, nessuna statistica**, nessuna vendita o condivisione di dati per il marketing, nessuna profilazione, nessun addestramento di modelli di IA con i tuoi dati.

Il resto di questa informativa fornisce i dettagli richiesti dalla legge federale svizzera sulla protezione dei dati (LPD) e dal regolamento generale europeo sulla protezione dei dati (GDPR).
<!-- /note -->

## Indice

1. Chi è responsabile
2. Come è fatto Hemmia, e chi è responsabile di cosa
3. L’app Hemmia sul tuo telefono
4. Hemmia Connect (il nostro relay)
5. Notifiche
6. Il controllo degli aggiornamenti
7. Certificati per l’indirizzo del tuo hub
8. Cosa non facciamo mai
9. Autorizzazioni del telefono
10. Chi altro riceve dati
11. Paesi in cui vanno i dati
12. Per quanto tempo conserviamo i dati
13. I tuoi diritti
14. Bambini e ragazzi
15. Sicurezza
16. Questo sito, le domande e la beta
17. Modifiche di questa informativa

## 1. Chi è responsabile

Il titolare del trattamento descritto in questa informativa è:

Andreas Kalkum\
Burgstrasse 21\
5634 Merenschwand\
Svizzera\
E-mail: andreas.apps@icloud.com

Hemmia è fatto da una sola persona, quindi non c’è un responsabile della protezione dei dati separato. Scrivi all’indirizzo sopra per qualsiasi domanda o richiesta sulla privacy, in italiano, inglese, tedesco o francese.

## 2. Come è fatto Hemmia, e chi è responsabile di cosa

Hemmia ha tre parti, e la responsabilità segue chi le gestisce:

- **L’hub Hemmia** è un software che installi sul tuo computer (un Mac, o qualsiasi computer con Docker). Conserva gli account, le chat, le foto, i documenti e le impostazioni della tua famiglia su quel computer, cifrati per persona (la lista della spesa di famiglia, che tutti condividono, con una chiave conservata su quel computer). **Non gestiamo il tuo hub e non vi abbiamo accesso.** La persona che gestisce un hub (l’«admin») è responsabile dei dati personali delle persone che lo usano, ad esempio dei familiari che invita. Quando l’hub usa un modello di IA cloud, cerca sul web, apre una pagina web, scarica un modello o invia una notifica a un browser, lo fa da quel computer, per conto dell’admin, secondo le impostazioni che sceglie. Questa informativa descrive il software perché tu sappia cosa fa; non è una promessa su come un determinato admin gestisce il proprio hub.
- **L’app Hemmia** gira sul tuo telefono. Si collega a un hub (sezione 3.1) oppure funziona da sola con un fornitore di IA che scegli (sezione 3.2).
- **I nostri servizi**: Hemmia Connect (sezione 4), le notifiche tramite il relay (sezione 5), il controllo degli aggiornamenti (sezione 6) e questo sito (sezione 16). Per questi, siamo noi il titolare del trattamento.

## 3. L’app Hemmia sul tuo telefono

### 3.1 Con un hub

Quando colleghi l’app a un hub (scansionando un codice o aprendo un link), l’app mostra le pagine di quell’hub. I tuoi messaggi, foto e documenti vanno dal telefono all’hub, cifrati (HTTPS), direttamente (a casa, o tramite Tailscale) oppure tramite Hemmia Connect (sezione 4). L’app conserva sul telefono: l’elenco degli hub che hai aggiunto, il tuo accesso (un cookie di sessione per ogni hub) e le tue impostazioni. Nulla di questo ci viene inviato.

### 3.2 Da sola («Solo io, su questo telefono»)

Scegli Anthropic o OpenAI e incolli una chiave API del tuo account presso quel fornitore.

- **La tua chiave** è salvata nel portachiavi sicuro del telefono. Non ci viene mai inviata. L’app la usa solo per comunicare con il fornitore che hai scelto.
- **Prima che venga inviato qualsiasi cosa**, l’app ti chiede il permesso esplicito: ciò che scrivi, e le foto che aggiungi, vengono inviati a quel fornitore per ottenere risposte. Se non accetti, non viene inviato nulla e l’app non può rispondere.
- **Le tue chat** sono salvate sul telefono, cifrate. Quando invii un messaggio, l’app invia la conversazione fino a quel punto (e le eventuali foto) direttamente dal telefono al fornitore. Questo trattamento rientra nel **tuo contratto** con quel fornitore (le sue condizioni per i clienti API) e nella **sua informativa sulla privacy**; noi non riceviamo questi dati e non vi abbiamo accesso. Anthropic: anthropic.com/legal/privacy. OpenAI: openai.com/policies/privacy-policy. Le loro condizioni per i clienti API indicano anche per quanto tempo conservano ciò che viene inviato.
- **Esportare ed eliminare:** puoi esportare le tue chat in un file sul telefono, ed eliminare tutto nelle impostazioni dell’app.

Base giuridica di ciò che l’app fa sul telefono: la fornitura dell’app che hai scelto di usare (art. 6, par. 1, lett. b GDPR). Invio dei tuoi messaggi al fornitore: il tuo consenso (art. 6, par. 1, lett. a GDPR), che puoi revocare eliminando la chiave o l’app.

### 3.3 Cosa conserva l’app sul telefono

L’elenco degli hub, gli accessi, le impostazioni, la tua chiave API e la chiave che cifra le chat sul telefono sono conservati sul telefono perché le funzioni che usi ne hanno bisogno (art. 6, par. 1, lett. b GDPR, e l’eccezione per la memorizzazione strettamente necessaria secondo le norme europee ePrivacy e l’art. 45c della legge svizzera sulle telecomunicazioni). Eliminare l’app li elimina.

## 4. Hemmia Connect (il nostro relay)

Hemmia Connect permette ai tuoi telefoni di raggiungere il tuo hub da ovunque, senza aprire il router. L’admin lo attiva nelle impostazioni dell’hub. Il nostro server relay è ospitato da Oracle Cloud Infrastructure a Zurigo, in Svizzera.

**Cosa il relay non può vedere.** La connessione tra il tuo telefono e il tuo hub è cifrata end-to-end (TLS). La chiave privata del certificato esiste solo sul tuo hub. Il relay inoltra i dati cifrati senza poterli leggere: nessun messaggio, passphrase, foto o documento. Poiché gestiamo il dominio, potremmo in teoria ottenere un altro certificato per l’indirizzo del tuo hub; ogni certificato viene pubblicato in log pubblici di Certificate Transparency, quindi non passerebbe inosservato, e non lo facciamo. Gestiamo anche la pagina di accesso dei link (sotto) e il software del relay stesso: versioni modificate potrebbero leggere i codici nei link condivisi, senza lasciare tracce pubbliche. Non facciamo neanche questo, il codice sorgente del relay è pubblico, e i link di accesso funzionano una sola volta e solo per 10 minuti. Se preferisci non dipendere affatto da noi, usa Tailscale (sezione 3.1).

**Cosa tratta il relay, e perché:**

| Dati | Finalità | Base giuridica |
| --- | --- | --- |
| L’ID casuale del tuo hub (12 caratteri, ad es. `k7m2pq9xz4hr`) e la sua chiave pubblica | Dare al tuo hub il suo indirizzo (`<id>.h.hemmia.app`) e riconoscerlo | Contratto con l’admin (art. 6, par. 1, lett. b GDPR) |
| L’indirizzo IP al momento della registrazione, accorciato (ultima parte rimossa, ad es. `203.0.113.0/24`), e gli orari di registrazione e dell’ultima connessione | Limitare gli abusi (registrazioni per rete) ed eliminare gli hub inutilizzati | Interesse legittimo a un servizio sicuro (art. 6, par. 1, lett. f GDPR) |
| Per ogni connessione a un hub: l’indirizzo IP del dispositivo che si collega, l’indirizzo dell’hub, l’ora e la quantità di dati | Trattati necessariamente per inoltrare la connessione. L’indirizzo IP completo viene anche inoltrato al tuo hub, perché possa limitare i tentativi di accesso; cosa ne fa l’hub dipende dal suo admin (sezione 2). Nei nostri log vengono scritti solo l’indirizzo IP accorciato, l’ID dell’hub, il volume e la durata | Interesse legittimo a fornire e proteggere la connessione richiesta dall’admin (art. 6, par. 1, lett. f GDPR); contratto con l’admin |
| L’indirizzo IP del tuo hub mentre è collegato | Usato solo per mantenere la connessione e rispondere alle richieste dell’hub; non salvato | Contratto con l’admin |
| La quantità di dati per hub al mese | Applicare il limite mensile (20 GB per hub) | Contratto con l’admin |
| Richieste di certificato (contengono solo l’indirizzo dell’hub) | Ottenere il certificato dell’hub (sezione 7) | Contratto con l’admin |

Il relay non registra chi usa un hub, quali pagine vengono aperte o cosa viene detto.

**La pagina di accesso dei link** (`join.hemmia.app`). I link d’invito e di accesso che condividi si aprono su questa pagina, che li passa all’app o al tuo hub. Il codice di un link resta nella parte dell’indirizzo dopo `#`, che i browser non inviano al server; la pagina lo passa all’interno del tuo browser. Per fornire la pagina, il nostro server tratta il tuo indirizzo IP, che conserva solo in memoria per limitare le richieste e non registra. Base giuridica: il nostro interesse legittimo a fornire i link in modo sicuro (art. 6, par. 1, lett. f GDPR).

**Disattivare Connect o dimenticare l’indirizzo.** Disattivare Connect interrompe tutte le connessioni. **Dimentica questo indirizzo** nelle impostazioni dell’hub elimina la registrazione dell’hub sul relay. Un hub che non si collega da 12 mesi viene eliminato automaticamente.

**Blocco.** Se un hub viola le condizioni d’uso, ad esempio per offrire qualcosa di diverso da Hemmia, possiamo bloccarlo (vedi le condizioni d’uso). La registrazione di un hub bloccato (ID, chiave pubblica, indirizzo IP accorciato e orari), un breve motivo e l’ora del blocco vengono conservati perché la stessa chiave non possa registrarsi di nuovo. Riesaminiamo i blocchi almeno una volta all’anno.

## 5. Notifiche

Le notifiche ti dicono che una risposta o un’immagine è pronta, o che è l’ora del riepilogo del mattino. Non contengono mai le tue chat: il testo che vedi («La tua risposta è pronta») viene dall’app o dal browser stesso.

- **In un browser** (Hemmia aggiunto alla schermata Home): l’hub invia la notifica direttamente al servizio push del tuo browser (ad esempio quello di Apple per Safari). È un trattamento dell’hub (sezione 2), non nostro.
- **Nell’app per iPhone** con un hub che usa Connect: iOS fornisce all’app un token del dispositivo. L’app lo invia al tuo hub, e l’hub lo registra sul nostro relay. Il relay lo conserva **cifrato**, con la piattaforma e gli orari di creazione e di ultimo utilizzo, e restituisce all’hub solo un identificativo casuale. Quando l’hub vuole avvisarti, il relay invia al servizio di notifiche push di Apple il token del dispositivo, il tipo di notifica (ad esempio «risposta»), l’indirizzo del tuo hub (così l’app sa quale hub aprire) e un riferimento opaco che solo il tuo hub può risolvere. Per limitare gli abusi, il relay conserva per un giorno un elenco delle notifiche recenti per hub (ID dell’hub, un hash dell’identificativo, l’ora).

Base giuridica: la fornitura delle notifiche che hai attivato (art. 6, par. 1, lett. b GDPR). È l’autorizzazione di iOS, che puoi revocare in qualsiasi momento nelle Impostazioni di iOS, a decidere se vengono mostrate.

Hemmia non è ancora disponibile per Android. Prima dell’uscita dell’app per Android, Google (Firebase Cloud Messaging), che ne consegnerebbe le notifiche, verrà aggiunto a questa informativa.

## 6. Il controllo degli aggiornamenti

Gli hub installati con il nostro pacchetto per Mac o la nostra immagine Docker controllano una volta al giorno se esiste una versione più recente. La richiesta va al nostro relay e contiene solo la versione dell’hub (ad esempio `0.1.0`), la piattaforma (`mac` o `docker`) e il canale (`stable` o `beta`). Il nostro server conta queste richieste per giorno, versione, piattaforma e canale. Usa il tuo indirizzo IP solo in memoria, per contare un indirizzo al massimo tre volte al giorno, e non lo salva né lo registra mai. La risposta è firmata, quindi il tuo hub agisce solo su informazioni che vengono davvero da noi.

I conteggi ci dicono più o meno quanti hub eseguono quale versione; non contengono dati personali. Base giuridica del breve trattamento dell’indirizzo IP: il nostro interesse legittimo a mantenere aggiornati gli hub e a sapere quali versioni sono in uso (art. 6, par. 1, lett. f GDPR). L’admin può disattivare il controllo; l’hub allora non invia nulla. Con Docker: imposta `HEMMIA_UPDATE_CHECK=0` nel file `.env` accanto a `compose.yaml` (vedi la guida Docker). Su un Mac è previsto un interruttore nelle impostazioni; fino ad allora, scrivici e ti diremo come disattivarlo.

**L’elenco dei modelli.** Una volta al giorno ogni hub collegato al nostro relay (non solo quelli installati con il nostro pacchetto o la nostra immagine Docker) scarica anche l’elenco dei modelli che Hemmia propone, così l’admin può scaricarne di nuovi e sapere delle nuove versioni dei modelli che la famiglia usa. Questa richiesta non contiene nulla sull’hub: nessuna versione, nessun identificativo, nessun nome dei modelli in uso. Non la contiamo e non conserviamo né registriamo il tuo indirizzo IP. L’elenco è firmato come le informazioni sugli aggiornamenti. Base giuridica del breve trattamento dell’indirizzo IP: il nostro interesse legittimo a proporre modelli adatti e a informare le famiglie delle nuove versioni (art. 6, par. 1, lett. f GDPR). L’admin la disattiva in Impostazioni → Modelli («Cerca nuovi modelli ogni giorno»).

## 7. Certificati per l’indirizzo del tuo hub

Perché il tuo telefono possa fidarsi dell’indirizzo del tuo hub, il relay chiede all’autorità di certificazione Let’s Encrypt (Internet Security Research Group, USA) un certificato per quell’indirizzo. Per dimostrare che l’indirizzo è nostro, il relay inserisce un record temporaneo nel nostro DNS presso Cloudflare. Let’s Encrypt pubblica ogni certificato che emette in log pubblici di Certificate Transparency, come devono fare tutte le autorità di certificazione pubbliche. L’indirizzo del tuo hub compare quindi in quei log. È composto da un ID casuale e non dice nulla di te; non è collegato al tuo nome da nessuna parte.

## 8. Cosa non facciamo mai

- Niente pubblicità, e nessun software di pubblicità, statistiche o tracciamento nelle app, nell’hub o su questo sito.
- Nessun tracciamento tra app o siti, e nessun uso dell’identificativo pubblicitario di Apple.
- Nessuna vendita, noleggio o condivisione di dati personali per il marketing.
- Nessuna profilazione e nessuna decisione automatizzata che ti riguardi (art. 22 GDPR, art. 21 LPD).
- Nessun uso delle tue chat, foto o altri contenuti per addestrare modelli di IA, né da parte nostra né per nostro conto.
- Mai accesso alle tue chat: non sono sui nostri server.

Se in iOS hai scelto di condividere dati di analisi con gli sviluppatori di app, Apple può fornirci rapporti sugli arresti anomali e statistiche di utilizzo aggregate. Non ti identificano. Lo controlla Apple nelle impostazioni di iOS, non l’app. Base giuridica: il consenso che hai dato ad Apple in iOS (art. 6, par. 1, lett. a GDPR) e il nostro interesse legittimo a correggere gli errori (art. 6, par. 1, lett. f GDPR).

## 9. Autorizzazioni del telefono

| Autorizzazione | Usata per | Se rifiuti |
| --- | --- | --- |
| Fotocamera | Scansionare il codice che collega l’app a un hub; scattare foto che aggiungi a una chat | Incolla invece il link; scegli le foto dalla libreria |
| Notifiche | Sapere quando una risposta o un’immagine è pronta, e il riepilogo del mattino | Apri l’app per vedere le nuove risposte |

Le foto che scegli dalla libreria vengono passate all’app una alla volta da iOS. Puoi modificare queste autorizzazioni in qualsiasi momento nelle Impostazioni di iOS.

## 10. Chi altro riceve dati

Trasmettiamo dati solo ai seguenti destinatari, e solo come descritto sopra:

| Destinatario | Ruolo e dati | Luogo |
| --- | --- | --- |
| Oracle (Oracle Cloud Infrastructure) | Responsabile del trattamento che ospita il nostro relay (sezioni 4–6) | Zurigo, Svizzera |
| Cloudflare | Responsabile del trattamento per il DNS del nostro dominio (compresi i record temporanei dei certificati, sezione 7) e per l’hosting di questo sito (sezione 16): indirizzi IP e dati tecnici delle richieste | Rete globale, compresi gli USA |
| Let’s Encrypt (Internet Security Research Group) | Autorità di certificazione indipendente: l’indirizzo del tuo hub, pubblicato nei log di Certificate Transparency | USA |
| Apple | Consegna le notifiche all’app per iPhone (token del dispositivo, tipo di notifica, indirizzo dell’hub, riferimento opaco), gestisce l’App Store e TestFlight (sezione 16), come titolare autonomo; fornisce anche il nostro servizio e-mail (iCloud Mail), in cui sono conservate le e-mail scambiate con noi | In tutto il mondo, compresi gli USA |
| Anthropic o OpenAI | Solo se usi l’app da sola e li scegli: i tuoi messaggi e le tue foto, con il tuo account presso di loro (sezione 3.2). Non riceviamo questi dati e non vi abbiamo accesso; il fornitore li tratta secondo il tuo contratto con lui. | USA e altrove, secondo le loro informative |

**Strumenti di IA.** Usiamo assistenti di programmazione basati sull’IA per sviluppare Hemmia e distribuire gli aggiornamenti sui nostri server. Non ricevono i dati personali descritti in questa informativa: i dati del relay, le domande e le e-mail li leggiamo noi stessi.

Possiamo comunicare dati se la legge ci obbliga, ad esempio a un tribunale o a un’autorità. Visto quanto pochi dati deteniamo, di solito c’è ben poco che potremmo comunicare. Non possiamo mai comunicare le chat: non le abbiamo.

## 11. Paesi in cui vanno i dati

Il nostro relay e i suoi dati sono in Svizzera. Alcuni trattamenti da parte di Cloudflare, Let’s Encrypt e Apple possono avvenire negli USA. Cloudflare, Inc. e Apple Inc. sono certificate secondo l’EU–US Data Privacy Framework e lo Swiss–US Data Privacy Framework, che la Commissione europea e il Consiglio federale svizzero hanno riconosciuto come garanzia di una protezione adeguata; le condizioni di trattamento dei dati di Cloudflare includono anche le clausole contrattuali tipo dell’UE, adattate per la Svizzera. Let’s Encrypt riceve solo l’indirizzo casuale del tuo hub, che pubblica per sua natura; questo trasferimento è necessario per fornire Connect come richiesto dall’admin (art. 49, par. 1, lett. b GDPR, art. 17 cpv. 1 lett. b LPD).

## 12. Per quanto tempo conserviamo i dati

| Dati | Eliminati |
| --- | --- |
| Registrazione dell’hub (ID, chiave pubblica, indirizzo IP accorciato, orari) | Quando l’admin usa **Dimentica questo indirizzo**; altrimenti 12 mesi dopo l’ultima connessione dell’hub. Hub bloccati: conservati finché il blocco è necessario, riesaminati almeno una volta all’anno. |
| Volume di dati mensile per hub | Dopo 3 mesi |
| Richieste di certificato | Dopo 7 giorni |
| Token di dispositivo per le notifiche (cifrati) | Quando l’hub o l’app li rimuove, o dopo 90 giorni senza utilizzo |
| Elenco delle notifiche recenti | Dopo 1 giorno |
| Log del relay (indirizzi IP accorciati, ID degli hub, volumi) | Al più tardi dopo 14 giorni |
| Domande e feedback inviati tramite il sito o un hub (sezione 16) | Dopo 12 mesi |
| E-mail scambiate con noi | Quando la questione è risolta, e al più tardi dopo 12 mesi, salvo obbligo di legge di conservarle |
| Dati dei beta tester da TestFlight (sezione 16) | Quando la beta finisce o la lasci |
| Conteggi del controllo degli aggiornamenti | Conservati; non contengono dati personali |
| Contenuto delle connessioni tramite il relay | Mai salvato |
| Tutto ciò che è sul tuo hub o telefono | Sotto il tuo controllo; non ne abbiamo copia |

Il database del relay viene salvato ogni notte, sul server del relay (conservato 7 giorni) e su un nostro computer in Svizzera (conservato 30 giorni). I dati eliminati possono restare in un backup fino a 30 giorni prima di essere sovrascritti. I backup sono leggibili solo da noi.

## 13. I tuoi diritti

Secondo il GDPR e la LPD svizzera hai il diritto di:

- accedere ai dati personali che conserviamo su di te (art. 15 GDPR, art. 25 LPD);
- far correggere i dati inesatti (art. 16 GDPR, art. 32 LPD);
- far cancellare i tuoi dati (art. 17 GDPR, art. 32 LPD);
- far limitare il trattamento (art. 18 GDPR);
- ricevere i tuoi dati in un formato portabile (art. 20 GDPR, art. 28 LPD);
- revocare il consenso in qualsiasi momento con effetto per il futuro, ad esempio eliminando la tua chiave nell’app (sezione 3.2) (art. 7, par. 3 GDPR);
- proporre reclamo a un’autorità di controllo della protezione dei dati. In Svizzera è l’Incaricato federale della protezione dei dati e della trasparenza (IFPDT, edoeb.admin.ch). Nell’UE è l’autorità del paese in cui vivi o lavori, o in cui è avvenuta una presunta violazione.

**Diritto di opposizione (art. 21 GDPR):** quando trattiamo i tuoi dati sulla base dei nostri interessi legittimi (sezioni 4, 6, 8 e 16), puoi opporti in qualsiasi momento per motivi connessi alla tua situazione particolare. Smettiamo allora, a meno che possiamo dimostrare motivi legittimi cogenti che prevalgono sui tuoi interessi, diritti e libertà, o che il trattamento serva all’accertamento, all’esercizio o alla difesa di un diritto in sede giudiziaria.

Scrivi a andreas.apps@icloud.com per esercitare questi diritti. Rispondiamo al più tardi entro un mese (30 giorni secondo la LPD). L’esercizio dei tuoi diritti è gratuito.

**Una nota pratica:** poiché Hemmia non ha account da noi, un’e-mail non ci dice quali dati sono tuoi. Per Connect, l’admin del tuo hub vede l’indirizzo dell’hub in **Impostazioni → Sistema**; inviaci quell’indirizzo e potremo trovarne i dati. Il modo più rapido per eliminarli è **Dimentica questo indirizzo** nello stesso posto. Se non possiamo identificarti con ragionevole certezza, te lo diremo (art. 11 e 12, par. 2 GDPR). Non chiederemo mai più dati personali del necessario per questo.

Per i dati su un hub, rivolgiti alla persona che lo gestisce: è lei a detenerli, non noi. Chiunque abbia un account su un hub può eliminarlo, con tutto il suo contenuto, in **Impostazioni → Account → Elimina account**; un admin può eliminare gli account degli altri in **Impostazioni → Famiglia**. Per i dati che hai inviato ad Anthropic o OpenAI, rivolgiti a quel fornitore.

## 14. Bambini e ragazzi

L’app Hemmia è destinata a persone dai 13 anni in su. Su un hub, l’admin decide chi riceve un account e può creare account per ragazzi, che vedono solo i modelli consentiti dall’admin, cercano sul web con SafeSearch rigoroso o per niente, e non possono creare immagini. I genitori sono responsabili dell’uso da parte dei figli di un hub che gestiscono. Usare l’app da sola richiede un account presso Anthropic o OpenAI, a cui si applicano le loro regole sull’età. Anthropic, ad esempio, richiede che i suoi clienti API abbiano almeno 18 anni, quindi da sola l’app è in pratica per adulti; i ragazzi possono usare un hub gestito da un genitore. Se non hai l’età per acconsentire da solo al trattamento dei dati nel tuo paese (nell’UE tra 13 e 16 anni, a seconda del paese), usa Hemmia solo con il permesso di un genitore o tutore. Hemmia non è rivolto ai bambini sotto i 13 anni. I genitori che ritengono che il proprio figlio sotto i 13 anni usi l’app da solo possono eliminare tutto nelle impostazioni dell’app o contattarci.

## 15. Sicurezza

Proteggiamo i dati con misure tecniche e organizzative adeguate al rischio, tra cui:

- cifratura in transito di tutte le connessioni (TLS), e cifratura end-to-end tra il tuo telefono e il tuo hub tramite il relay;
- cifratura a riposo: le chat su un hub sono cifrate con una chiave che solo la passphrase della persona (o il codice di recupero) sblocca; nell’app sono cifrate sul telefono; i token di dispositivo sul relay sono cifrati;
- i dispositivi devono essere associati a un hub prima di poterlo raggiungere tramite il relay;
- indirizzi IP accorciati nei log, conservazione breve ed eliminazione automatica;
- informazioni di aggiornamento firmate, perché un hub si fidi solo di ciò che abbiamo pubblicato;
- limiti di frequenza e la possibilità di bloccare gli hub che usano il relay in modo improprio.

Nessun sistema è completamente sicuro. Se una violazione dei dati può metterti a rischio, informeremo le autorità competenti e, se necessario, te.

## 16. Questo sito, le domande e la beta

Questo sito non usa cookie, statistiche, tracciamento né font o script caricati dall’esterno. È ospitato da Cloudflare (Cloudflare Pages). Per fornire le pagine, Cloudflare tratta necessariamente il tuo indirizzo IP e i dati tecnici che il browser invia, come il tipo di browser e la pagina richiesta, e può conservarli in log di breve durata per sicurezza. Non riceviamo né analizziamo log di accesso. Base giuridica: il nostro interesse legittimo a fornire il sito in modo sicuro (art. 6, par. 1, lett. f GDPR). Se ci scrivi un’e-mail, usiamo il tuo indirizzo e-mail e il messaggio solo per risponderti o gestire la tua segnalazione, e li eliminiamo quando la questione è risolta, salvo obbligo di legge di conservarli. Base giuridica: il nostro interesse legittimo a risponderti e gestire le segnalazioni (art. 6, par. 1, lett. f GDPR), o passi che chiedi nell’ambito di un contratto (art. 6, par. 1, lett. b GDPR). Le e-mail sono conservate al massimo 12 mesi dopo la risoluzione della questione.

**Domande e feedback.** Nelle pagine di installazione di questo sito e nei passi di configurazione di un hub puoi inviarci una domanda o un feedback. Riceviamo il tuo messaggio, un indirizzo e-mail se lo aggiungi (solo per poterti rispondere), la lingua, la pagina o il passo di configurazione da cui è stato inviato e, da un hub, la versione dell’hub (non il suo ID né il tuo account). Viene salvato sul nostro relay in Svizzera, ci viene inviato una volta al giorno via e-mail (sezione 10, Apple) ed eliminato dopo 12 mesi. Il tuo indirizzo IP viene usato solo in memoria per limitare quanti messaggi può inviare un indirizzo, e non viene salvato. Base giuridica: il nostro interesse legittimo a rispondere alle domande e migliorare Hemmia (art. 6, par. 1, lett. f GDPR). Per favore non inserire dati personali che non vuoi che abbiamo.

**La beta (TestFlight).** Se provi l’app per iPhone prima della sua uscita, lo fai tramite TestFlight di Apple. Ci chiedi via e-mail di essere invitato, oppure ti unisci tramite un link pubblico. Apple ci comunica allora il tuo nome e indirizzo e-mail (se sei stato invitato via e-mail), il modello del dispositivo, la versione di iOS, quando hai installato e usato la versione di prova, i rapporti sugli arresti anomali, e il feedback e gli screenshot che scegli di inviare tramite TestFlight. Li usiamo solo per gestire la beta e correggere i problemi. Base giuridica: passi che hai chiesto partecipando alla beta (art. 6, par. 1, lett. b GDPR). Apple tratta questi dati come titolare autonomo secondo le proprie condizioni. Li eliminiamo quando la beta finisce o quando la lasci.

## 17. Modifiche di questa informativa

Se cambiamo il modo in cui Hemmia tratta i dati, aggiorneremo questa informativa e la data in alto. Le modifiche importanti verranno annunciate su hemmia.app, e quando possibile anche nell’app o nell’hub, prima che entrino in vigore. Quando Hemmia Connect verrà offerto come servizio a pagamento, il fornitore di pagamenti e ciò che tratta verranno aggiunti qui prima della prima vendita. La versione attuale è sempre su hemmia.app/it/legal/privacy/, in inglese su hemmia.app/legal/privacy/, in tedesco su hemmia.app/de/legal/privacy/ e in francese su hemmia.app/fr/legal/privacy/. Tutte dicono la stessa cosa.
