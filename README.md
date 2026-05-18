# InciSight.AI: A Personalized Skincare Intelligence System

![Python](https://img.shields.io/badge/python-3.11+-blue)
![Node](https://img.shields.io/badge/node-18+-green)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)


Skin conditions affect hundreds of millions of people worldwide, yet managing ingredient sensitivities remains a largely unsolved problem. Cosmetic labels list ingredients in standardized INCI notation that is long, chemically opaque, and largely inaccessible to the average consumer — making it nearly impossible to trace a skin reaction back to its source. InciSight AI is a web-based platform designed to close that gap, combining optical character recognition, vector-based product matching, and a retrieval-augmented generation pipeline to translate raw ingredient data into personalized, actionable skincare intelligence.


---
## Capabilities

**Phase 1:** Uploaded label photo → Google Cloud Vision OCR → structured INCI list saved to shelf.\
**Phase 2:** `text-embedding-3-small` embeds each ingredient list and stores the vector in pgvector.\
**Phase 3:** Skin reactions are scored by severity × recency into a Suspect INCI List.\
**Phase 4:** Queries are augmented with skin profile, shelf, and KB entries before being sent to LLM.

**Skin Profile:** set skin type, goals, and a personal ingredient avoid list\
**Product Shelf:** add products via OCR label scan or catalog search; track open date and PAO expiry\
**Reaction Diary:** log daily skin reactions per product (OK / Irritated / Breakout)\
**Suspect INCI List:** auto-ranked ingredients from reaction history, weighted by severity and recency\
**Inbox:** proactive alerts for expiring products and flagged ingredient reactions\
**AI Chat:** multi-turn RAG assistant for product comparisons, routine advice, and conflict detection


---

## Stack

| Layer | Technology |
|:------|:-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| Database | Supabase — PostgreSQL 17 + pgvector |
| AI / LLM | OpenAI gpt-4o-mini (chat), text-embedding-3-small (vector search) |
| OCR | Google Cloud Vision API |
| Auth | Supabase Auth (JWT) |


---

## Install & Run

```bash
cd backend && pip install -r requirements.txt && cp .env.example .env && uvicorn app.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

