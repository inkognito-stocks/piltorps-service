# Piltorps Service

Service- och kalibreringsprotokoll för Leister-maskiner – Piltorps Varmluft AB.

- Frontend: Vite + React + TypeScript + Tailwind (shadcn/ui)
- Backend: Supabase-projekt `piltorps-service` (nmjocthfuatqralbtamk, eu-north-1)
- Hosting: Vercel. `api/vision.ts` läser av etiketter och instrumentdisplayer med Claude.

## Miljövariabler (Vercel)
| Nyckel | Var |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | klient (publika) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | serverfunktionen – verifierar inloggning |
| `ANTHROPIC_API_KEY` | serverfunktionen – **hemlig** |
| `ANTHROPIC_MODEL` | valfri, standard `claude-sonnet-5-5` |

## Lokalt
```
npm install
npm run dev
```

## Sidor
- `/` Serviceprotokoll · `/customers` Kunder · `/calibration` Kalibrering · `/upcoming` Kommande service · `/models` Modeller · `/migrate` Flytta data från Lovable
