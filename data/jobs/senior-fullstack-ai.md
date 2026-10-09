---
slug: senior-fullstack-ai
title: Senior Full-Stack Engineer, AI Platform
company: Northbeam Analytics
requirements:
  - id: R1
    text: 5+ years building production web applications with TypeScript and React
    kind: must
    weight: 3
  - id: R2
    text: Designed and operated backend APIs and relational databases (PostgreSQL preferred)
    kind: must
    weight: 3
  - id: R3
    text: Shipped LLM-powered features to production (prompting, tool calling, structured outputs)
    kind: must
    weight: 2
  - id: R4
    text: Built retrieval-augmented generation with embeddings and a vector store
    kind: must
    weight: 2
  - id: R5
    text: AWS serverless experience (Lambda or equivalent)
    kind: nice
    weight: 1
  - id: R6
    text: CI/CD and automated testing practice
    kind: nice
    weight: 1
  - id: R7
    text: Mentoring or technical leadership
    kind: nice
    weight: 1
---

Northbeam Analytics builds forecasting and reporting software for mid-sized logistics companies. Our customers run warehouses, regional carriers and freight brokerages, and they use Northbeam every day to plan capacity, explain cost changes and answer questions about their own operations. Over the last year we started adding AI features to the product: natural-language questions over a customer's shipment history, automatic summaries of weekly performance, and an assistant that drafts carrier scorecards from contract terms and delivery data.

We are hiring a Senior Full-Stack Engineer to join the AI Platform team. The team is five engineers and a product manager. We own the shared services that every AI feature uses: the retrieval layer, the prompt and evaluation tooling, model routing, usage metering and the safety checks that run before anything reaches a customer. We also build the first version of new AI features end to end, then hand them to product teams once they are stable.

## What you will do

- Design, build and operate TypeScript services and React interfaces that put AI features in front of customers, from the database schema to the last loading state.
- Own parts of our retrieval stack: chunking, embeddings, hybrid search over PostgreSQL with pgvector, and the evaluation sets that tell us whether a change helped.
- Write and version prompts, define structured outputs and tool schemas, and make model output safe to act on through validation, citations and fallbacks.
- Run what you build. We deploy several times a day through CI, on AWS Lambda and managed PostgreSQL, and we expect engineers to watch dashboards, read logs and fix what breaks.
- Raise the bar for the team through design reviews, pairing and mentoring, and help us decide what not to build.

## What we look for

The requirements below are what we screen for. Must-haves are needed to do the job from the first month; nice-to-haves help but are not required. We judge evidence of work, not keywords: tell us what you built, how it was used and what you learned.

We do not consider age, gender, ethnicity, nationality, disability, family status or any other protected attribute, and we do not ask for photos, dates of birth or graduation years.

## How we work

We are remote-first across North American time zones, with two planning weeks in person each year. We write things down: design documents, decision records and runbooks are part of the work, not an afterthought. Engineers choose their own tools within a small, well-supported stack: TypeScript on Node.js, React, PostgreSQL, AWS, GitHub Actions and Terraform. We keep on-call humane, with a weekly rotation, a follow-up review after every incident and time set aside to fix the causes.

## Interview process

A 30-minute call with the hiring manager, a 90-minute pairing session on a small problem from our codebase, a system design conversation about a retrieval feature, and a conversation with two engineers from the team about how you work. We share feedback after every stage.
