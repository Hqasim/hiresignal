# Gabriel Silva

gabriel.silva@example.com | gabe.silva\u{200B}@example.org | (503) 555-0110 | +1 503 555 0111
418 Larkspur Avenue, Apt 3B, Portland, OR 97205
linkedin.com/in/gabriel-silva-fullstack | github.com/gsilva-dev | https://gsilva.example.com

## Summary

Senior full-stack engineer with eight years of Type\u{200B}Script, React and PostgreSQL. For the past two years I have led the AI features of a travel-booking platform: a retrieval-augmented trip assistant, tool calling for bookings, and the evaluation pipeline that keeps them honest. Gabriel works best on small teams that own their services end to end.

## Experience

### Lead Engineer, AI Features, Wayfarer Trips (2022–present)

- Led a team of four building a retrieval-augmented trip assistant: hotel and policy documents chunked by section, embedded with Gemini, and searched with hybrid vector and keyword search in PostgreSQL with pgvector.
- Shipped tool calling so the assistant can check availability and hold bookings; tools are typed with Zod, scoped to the signed-in user and logged.
- Defined structured outputs for every model response and added a repair step and a fallback model, keeping the error rate under 0.5% at 20,000 conversations a day.
- Built the evaluation pipeline (retrieval recall, citation checks, answer grading) that runs in GitHub Actions on every prompt change.
- Run the assistant's API on AWS Lambda with Step Functions for long-running booking holds.

### Senior Software Engineer, Wayfarer Trips (2019–2022)

- Built the React and TypeScript search and checkout flows, used by 1.5 million travellers a month.
- Designed Node.js APIs and the PostgreSQL schema for itineraries and payments.
- Introduced Playwright end-to-end tests and trunk-based deployment.

### Software Engineer, Basalt Interactive (2016–2019)

- Built React dashboards and Express APIs for media clients.
- Mentored two interns, both of whom joined full time.

## Projects

### Itinerary diff

- A TypeScript library that explains changes between two travel itineraries in plain language.

## Skills

TypeScript, React, Node.js, PostgreSQL, pgvector, Gemini API, Zod, AWS Lambda, Step Functions, GitHub Actions, Playwright, Vitest

## Education

B.S. Computer Science, Cascadia Polytechnic Institute, 2012–2016
