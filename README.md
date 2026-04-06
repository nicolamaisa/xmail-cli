# mia-tui

Terminal UI sperimentale per controllare XMail da riga di comando con un'interfaccia TUI basata su `@pm2/blessed`.

## Stato attuale

Il progetto oggi ha una base funzionante per:

- splash screen iniziale;
- dashboard TUI con area log e input comandi;
- suggerimenti comandi con `Tab`;
- build del bundle Node con `esbuild`;
- typecheck JavaScript con TypeScript in modalità `checkJs`.

Non è ancora un client completo di produzione: alcuni comandi sono ancora placeholder e l'integrazione Docker/XMail va rifinita.

## Requisiti

- Node.js 18+
- npm

Per alcune funzioni runtime:

- Docker attivo;
- accesso al socket Docker se vuoi rilevare lo stato dei container da TUI.

## Installazione

```bash
npm install
```

## Script disponibili

```bash
npm run build
npm run typecheck
npm run package
```

Significato:

- `build`: crea `dist/bundle.js` con `esbuild`;
- `typecheck`: esegue il controllo statico sui file JS senza emettere output;
- `package`: crea il binario Linux `xmail-linux` usando `pkg`.

## Avvio

Durante lo sviluppo puoi avviare l'entrypoint Node del progetto:

```bash
node entry.js
```

Oppure:

```bash
node index.mjs
```

Se preferisci usare il bundle generato:

```bash
npm run build
node dist/bundle.js
```

## Comandi TUI

Comandi attualmente registrati:

- `/help`
- `/clear`
- `/test`
- `/frontend`
- `/exit`
- `/quit`

## Struttura del progetto

```text
mia-tui/
├── index.mjs            # entrypoint principale
├── entry.js             # loader minimale
├── commands/            # handler dei comandi
├── constants/           # colori e lista comandi
├── lib/                 # layout, refresh UI, suggerimenti
├── ui/                  # splash e dashboard
├── global.d.ts          # tipi globali minimi per checkJs
├── pm2-blessed.d.ts     # dichiarazione del modulo @pm2/blessed
└── tsconfig.json        # configurazione typecheck
```

## Note su TypeScript e IDE

Il progetto usa file JavaScript con:

- `allowJs: true`
- `checkJs: true`
- `noEmit: true`

`noEmit: true` è importante: evita che TypeScript o l'IDE provino a scrivere file compilati sopra i sorgenti `.js`, che era la causa degli errori tipo:

`Cannot write file ... because it would overwrite input file`

## Limitazioni note

- Il controllo stato progetto usa `docker ps`.
- In ambienti senza permessi Docker, la TUI parte comunque ma il check dello stato può risultare `false`.
- I file `index2.mjs` e `index3.mjs` sono prototipi esclusi dal typecheck.

## Prossimi passi consigliati

- implementare comandi reali per `/status`, `/init` e `/frontend`;
- rimuovere o archiviare i prototipi non più usati;
- aggiungere test minimi per i comandi e per la logica di suggerimento;
- documentare il flusso di packaging del binario.
