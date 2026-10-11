import { ASK_QUESTION_MAX_CHARS } from '@hiresignal/contracts';
import { Send } from 'lucide-react';
import { type SubmitEvent, useId, useState } from 'react';

import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { AnswerCard } from './answer-card';
import { useAsk } from './api';
import { SuggestedQuestions } from './suggested-questions';

/**
 * Ask the talent pool (SPEC §11): a labelled question box with a character count, suggested
 * questions, and one live region that announces loading, the answer or the problem.
 */
export function AskPanel({ slug }: { slug: string }) {
  const [question, setQuestion] = useState('');
  const ask = useAsk(slug);
  const inputId = useId();
  const counterId = useId();
  const trimmed = question.trim();
  const canAsk = trimmed !== '' && !ask.isPending;

  const submit = (text: string) => {
    if (text.trim() !== '') {
      ask.mutate(text.trim());
    }
  };
  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(question);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-2">
        <label htmlFor={inputId} className="text-sm font-semibold">
          Your question
        </label>
        <Textarea
          id={inputId}
          value={question}
          maxLength={ASK_QUESTION_MAX_CHARS}
          aria-describedby={counterId}
          rows={3}
          placeholder="Who has shipped tool calling to production?"
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              submit(question);
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={counterId} className="text-xs text-muted-foreground">
            {question.length}/{ASK_QUESTION_MAX_CHARS} characters · Ctrl+Enter to ask
          </p>
          <Button type="submit" disabled={!canAsk}>
            <Send aria-hidden />
            {ask.isPending ? 'Asking…' : 'Ask'}
          </Button>
        </div>
      </form>

      <SuggestedQuestions
        disabled={ask.isPending}
        onPick={(picked) => {
          setQuestion(picked);
          submit(picked);
        }}
      />

      <div aria-live="polite" aria-busy={ask.isPending}>
        {ask.isPending && <LoadingState label="Searching the talent pool…" rows={3} />}
        {ask.isError && <ErrorState error={ask.error} title="Couldn't answer the question" />}
        {ask.isSuccess && <AnswerCard response={ask.data} />}
      </div>
    </div>
  );
}
