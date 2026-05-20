# NDA Lead Hub

Applicazione operativa per centralizzare lead, conversazioni commerciali e appuntamenti su Supabase.

## Cosa contiene

- `app/`: dashboard admin e form pubblico di raccolta lead
- `db/001_init.sql`: schema database iniziale con RLS
- `supabase/functions/lead-intake/`: Edge Function per ricevere nuovi lead pubblici

## Stack scelto

- Frontend statico HTML/CSS/JS
- Supabase Auth per accesso operatori
- Supabase Postgres per dati applicativi
- Supabase Edge Functions per intake lead pubblico

## Flussi coperti

1. Un lead arriva da un form pubblico o da una sorgente esterna
2. Il lead viene salvato su Supabase con il primo messaggio
3. Gli operatori accedono alla dashboard con email OTP
4. Possono aggiornare stato, appuntamento, note e conversazione

## Avvio locale

Da dentro `app/` puoi usare un server statico semplice:

```bash
cd /workspace/nda-lead-hub/app
python3 -m http.server 4173
```

Poi apri:

- `http://localhost:4173/` per la dashboard
- `http://localhost:4173/intake.html` per il form pubblico

## Passi di setup

1. Applica `db/001_init.sql` al progetto Supabase
2. Distribuisci la funzione `lead-intake`
3. Verifica o personalizza `app/supabase-config.js`
4. Attiva il provider email OTP in Supabase Auth

