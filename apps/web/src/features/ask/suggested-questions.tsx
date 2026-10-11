/**
 * Questions from the golden set (`data/evals/retrieval.jsonl`), so they replay offline locally and
 * in E2E (SPEC §3). The last one is out of scope on purpose: it shows the insufficient-evidence
 * path, answered without a model call.
 */
export const SUGGESTED_QUESTIONS = [
  'Who has built retrieval-augmented generation with embeddings and a vector store?',
  'Which candidates have shipped tool calling to production?',
  'Who has defended an AI assistant against prompt injection?',
  'Who moved into software from mechanical engineering?',
  'Who holds a commercial pilot license?',
] as const;

/** One-click questions; picking one asks it straight away. */
export function SuggestedQuestions({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (question: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Try a question</h2>
      <ul className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((question) => (
          <li key={question}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onPick(question);
              }}
              className="rounded-full border px-3 py-1 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
