# Priya Raman

priya.raman@example.com | (312) 555-0101 | linkedin.com/in/priya-raman-dev

## Summary

Senior full-stack engineer with nine years of TypeScript, React and PostgreSQL. For the last three years I have shipped LLM features at a fintech company, including a retrieval-augmented assistant over account documents and a tool-calling agent for support staff. Comfortable owning a feature from schema design to production on AWS Lambda.

## Experience

### Senior Software Engineer, Ledgerline Financial (2021–present)

- Led the build of a retrieval-augmented support assistant that answers questions over 1.2 million account documents; designed the chunking, OpenAI and Gemini embeddings, and hybrid search on PostgreSQL with pgvector.
- Shipped a tool-calling agent that lets support staff look up transactions and draft refunds; every tool call is validated with Zod and logged, and the agent can only read data.
- Introduced structured outputs with JSON Schema and a repair step, which cut malformed model responses from 4% to under 0.2%.
- Built the evaluation harness for retrieval and answers (recall@5, citation accuracy) and made it a required CI check.
- Moved the AI services to AWS Lambda behind API Gateway, with provisioned concurrency for the chat endpoint; p95 latency dropped from 3.1 s to 1.4 s.
- Mentor two mid-level engineers and run the team's design review.

### Software Engineer, Brightpath Health (2017–2021)

- Built React and TypeScript patient-scheduling screens used by 300 clinics.
- Designed REST APIs in Node.js and Express over PostgreSQL, including the appointment model and its migrations.
- Set up GitHub Actions pipelines with unit, integration and Playwright tests; deployment time fell from 40 minutes to 8.

### Junior Developer, Cobalt Web Studio (2015–2017)

- Built marketing sites and small React applications for agency clients.

## Projects

### Open-source eval runner

- A small TypeScript library that runs retrieval eval sets against any search function and prints recall and MRR tables; used by two teams at Ledgerline.

## Skills

TypeScript, React, Node.js, PostgreSQL, pgvector, AWS Lambda, DynamoDB, GitHub Actions, Playwright, Vitest, Zod, OpenAI and Gemini APIs, prompt engineering, RAG evaluation

## Education

B.S. Computer Science, Lakeshore State University, 2015
