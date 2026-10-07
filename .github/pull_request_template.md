## What and why

<!-- One or two sentences. Link the SPEC section or ADR this implements. -->

## How to verify

<!-- Commands or clicks a reviewer can repeat. -->

## Checklist

- [ ] `npm run verify` passes locally
- [ ] Behaviour is covered by tests (unit, route, component, integration or e2e as appropriate)
- [ ] No live LLM calls in tests; fixtures re-recorded only via `npm run seed:record`
- [ ] No PII, prompts, model output or secrets in logs
- [ ] Resume text reaches models only as `RedactedText`
- [ ] TSDoc on new exports; folder README updated if responsibilities changed
- [ ] ADR added for any non-obvious decision; `docs/SPEC.md` updated if direction changed
- [ ] New dependencies are pinned exactly and justified in the commit message
