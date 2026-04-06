# Changelog

Tutte le modifiche rilevanti a `mia-tui` verranno documentate in questo file.

Il formato segue una struttura ispirata a Keep a Changelog e versioning semantico dove possibile.

## [Unreleased]

### Added

- README iniziale con istruzioni di installazione, build, typecheck, avvio e struttura del progetto.
- Base del typecheck JavaScript con TypeScript in modalità `checkJs`.
- Dichiarazioni minime in `global.d.ts` e `pm2-blessed.d.ts` per supportare editor e controllo statico.

### Changed

- Rifattorizzato l'entrypoint principale per usare i moduli in `commands/`, `constants/`, `lib/` e `ui/`.
- Rinominati i file con typo:
  `ui/spash.js` -> `ui/splash.js`
  `lib/reflesh.js` -> `lib/refresh.js`
- Aggiornata la configurazione TypeScript per evitare emissione di file sui sorgenti JavaScript con `noEmit: true`.

### Fixed

- Corretti import interni errati durante il refactor modulare.
- Risolti gli errori TypeScript/IDE del tipo `Cannot write file ... because it would overwrite input file`.
- Ripulito il perimetro del typecheck escludendo artefatti e prototipi non usati.

## [1.0.0] - 2026-04-06

### Added

- Prima base del progetto `mia-tui`.
- Splash screen iniziale.
- Dashboard TUI con area log e input comandi.
- Comandi base: `/help`, `/clear`, `/test`, `/frontend`, `/exit`, `/quit`.
- Packaging del bundle Node con `esbuild`.
- Packaging binario Linux con `pkg`.

### Notes

- Questa versione rappresenta una base iniziale e non ancora una release completa di produzione.
