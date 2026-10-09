# Daniel Kim

daniel.kim@example.com | (206) 555-0105 | github.com/dkim-builds

## Summary

Software engineer who moved into software after six years as a mechanical engineer. Three years of professional TypeScript and React, plus side projects that go deeper: a retrieval-augmented search tool over engineering manuals and a typed API toolkit. I like measuring things, which shows in how I test.

## Experience

### Software Engineer, Fieldnote Systems (2022–present)

- Build React and TypeScript screens for a field-service scheduling product used by 2,000 technicians.
- Designed and own the Node.js API for work orders and its PostgreSQL schema, including the migration from a single table to an event log.
- Added the team's first contract tests and cut flaky end-to-end tests from 30 to 2.
- Deploy through GitHub Actions to AWS, including two Lambda functions that process uploaded photos.

### Mechanical Engineer, Ironvale Manufacturing (2015–2021)

- Designed tooling for an assembly line and wrote Python scripts to analyse sensor data from the line.
- Led a team of three technicians on a fixture redesign that reduced scrap by 18%.

## Projects

### ManualSearch: RAG over engineering manuals

- Built a retrieval-augmented question-answering tool over 4,000 pages of equipment manuals: section-aware chunking, Gemini embeddings stored in PostgreSQL with pgvector, and answers that cite page numbers.
- Wrote an evaluation set of 60 questions and compared vector-only and hybrid search; hybrid search improved recall@5 from 0.71 to 0.86.
- Used structured outputs with a JSON schema and Zod validation so answers always include citations.
- Deployed as a small TypeScript API on AWS Lambda with a React front end.

### typed-fetch

- A small TypeScript library that validates API responses with Zod; 300 stars on GitHub.

## Skills

TypeScript, React, Node.js, PostgreSQL, pgvector, Gemini API, Zod, Python, AWS Lambda, GitHub Actions, Vitest, Playwright

## Education

Full-Stack Web Development Certificate, Summit Code Academy, 2021
B.S. Mechanical Engineering, University of Ridgefield, 2015
