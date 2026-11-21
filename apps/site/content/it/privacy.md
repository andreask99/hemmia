---
title: Privacy e sicurezza, spiegate
description: Cosa resta sui tuoi dispositivi, cosa va a un fornitore di IA, cosa vede il nostro relay e cosa conserva questo sito.
nav: privacy
order: 20
---

# Privacy e sicurezza, spiegate

Questa pagina dice in parole semplici cosa succede ai tuoi dati. I dettagli tecnici sono nel [progetto di sicurezza](https://github.com/andreask99/hemmia/blob/main/docs/SECURITY.md), pubblicato con il codice sorgente. I dettagli vincolanti sono nella nostra [Informativa sulla privacy](/it/legal/privacy/).

## Cosa resta sui tuoi dispositivi

- **A casa:** le tue chat, foto e documenti sono salvati sul tuo hub. Il contenuto di ognuno è cifrato con una chiave che deriva dalla sua passphrase, quindi gli altri in famiglia, e l’account admin dell’hub, non possono leggerlo. Se dimentichi la passphrase, il codice di recupero ti fa rientrare.
- **Sul telefono:** le tue chat e foto sono salvate nell’app, cifrate con una chiave che solo la memoria sicura del telefono conosce.
- Non esiste un account Hemmia e nessun nostro server conserva le tue chat.

**Un limite:** mentre usi Hemmia, l’hub deve decifrare i tuoi messaggi per rispondere. Chi in quel momento controlla completamente il computer dell’hub (non solo l’account admin) potrebbe in teoria leggerli. La cifratura protegge ciò che è salvato e protegge ognuno dagli altri.

## Cosa va a un fornitore di IA, e quando

- **I modelli locali** girano sul tuo hub. Ciò che scrivi loro non lascia mai la casa.
- **I modelli cloud** (Anthropic, OpenAI e altri) ricevono i messaggi delle chat che fai con loro, perché scrivono le risposte. Succede solo con una chiave che hai aggiunto tu, e solo per le chat in cui hai scelto uno di quei modelli. Su un hub, la tua chiave è salvata cifrata con la tua passphrase; nessun altro, nemmeno l’admin, può vederla o usarla. A ciò che ricevono si applicano le regole sulla privacy del fornitore.
- Sul telefono, l’app parla direttamente con il fornitore. La tua chiave è custodita nella memoria sicura del telefono e viene inviata solo a quel fornitore.

## Cosa vede il nostro relay (Hemmia Connect)

Se attivi Hemmia Connect, i telefoni raggiungono il tuo hub tramite il nostro relay quando sono fuori casa.

- La connessione è cifrata dal tuo telefono al tuo hub. Il relay la inoltra, ma non ha le chiavi per aprirla. Non vede mai i tuoi messaggi, le passphrase, le foto né in quale chat sei.
- Sa invece: l’indirizzo del tuo hub, quando si è collegato l’ultima volta, quanti dati sono passati questo mese e, mentre una connessione è aperta, l’indirizzo IP del telefono che si collega, che inoltra anche al tuo hub perché possa bloccare i tentativi di indovinare la password. I log conservano gli indirizzi IP solo accorciati.
- **Cosa potrebbe fare in teoria:** chi gestisce il relay controlla gli indirizzi sotto il suo dominio, quindi potrebbe in teoria ottenere un certificato per l’indirizzo del tuo hub e intercettare le connessioni nel frattempo. Ogni certificato di questo tipo viene pubblicato in log pubblici, dove è visibile. Gestisce anche la pagina su cui si aprono i link condivisi; una pagina modificata potrebbe quindi leggere un link d’invito o di accesso, senza lasciare tracce pubbliche (i link di accesso funzionano una sola volta, per 10 minuti). Non facciamo né l’una né l’altra cosa, e il codice è pubblico. È la stessa fiducia che dai a qualsiasi sito web. Se preferisci non darla, usa **Tailscale**, o usa l’hub solo in un browser sul suo computer.

## Notifiche

Quando una risposta o un’immagine è pronta, il telefono riceve una notifica. Non contiene nulla: il testo che vedi («La tua risposta è pronta») viene dall’app stessa, e il riferimento alla chat è cifrato dal tuo hub, quindi né Apple né il nostro relay possono sapere a quale chat appartiene.

## Controllo degli aggiornamenti

Una volta al giorno, un hub installato con il nostro pacchetto o la nostra immagine Docker chiede al nostro server se esiste una versione più recente. La richiesta dice solo quale versione esegue, se è la versione Mac o Docker e se segue le versioni normali o di test. Contiamo queste richieste per giorno, così sappiamo più o meno quanti hub eseguono quale versione. Non salviamo il tuo indirizzo IP e non viene inviato nulla su di te o sulla tua famiglia. La risposta è firmata, quindi il tuo hub si fida solo se viene davvero da noi. Con Docker disattivi il controllo con `HEMMIA_UPDATE_CHECK=0` in `.env`. Su un Mac è previsto un interruttore nelle impostazioni; fino ad allora, scrivici e ti diremo come fare.

Inoltre il tuo hub scarica una volta al giorno l’elenco dei modelli che Hemmia propone. Questa richiesta non contiene nulla sul tuo hub o sulla tua famiglia; non la contiamo e non conserviamo il tuo indirizzo IP. La disattivi in Impostazioni → Modelli.

## Questo sito

Niente cookie, niente statistiche, niente pixel di tracciamento, niente font o script da altri siti. Il server che ospita i file può conservare i normali log di accesso; non li usiamo per seguire nessuno.

## Open source

Il codice di Hemmia è [pubblicato su GitHub](https://github.com/andreask99/hemmia) con licenza AGPL, così chiunque può verificare cosa fa. Se trovi un problema di sicurezza, segnalalo in privato, tramite la [segnalazione privata di GitHub](https://github.com/andreask99/hemmia/security/advisories/new) o a andreas.apps@icloud.com, e lo correggeremo il prima possibile.

I dettagli vincolanti sono nella nostra [Informativa sulla privacy](/it/legal/privacy/) e nelle [Condizioni d’uso](/it/legal/terms/).
