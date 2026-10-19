# Bilancio

App per il budget personale da usare sull'iPhone. Funziona offline e importa l'estratto conto BPER in formato Excel.

**I dati restano solo sul dispositivo** (IndexedDB): non ci sono server né account, e nulla viene inviato online.

## Installazione su iPhone
1. Apri il link con Safari
2. Tocca Condividi, poi **Aggiungi alla schermata Home**

## Struttura
- `core.js`: lettura dell'estratto conto, categorizzazione automatica, controllo dei doppioni (senza interfaccia)
- `app.js`: interfaccia
- `sw.js`: cache per l'uso offline. **Aumenta `VERSIONE` a ogni modifica pubblicata.**
- `vendor/xlsx.full.min.js`: [SheetJS](https://sheetjs.com) 0.20.3, per leggere i file Excel
