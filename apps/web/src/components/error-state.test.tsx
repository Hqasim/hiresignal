import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('shows the problem detail and the request id to quote', () => {
    const error = new ApiError({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'No candidate with that id.',
      requestId: 'req-42',
    });

    render(<ErrorState error={error} title="Couldn't load the candidate" />);

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the candidate");
    expect(screen.getByText('No candidate with that id.')).toBeInTheDocument();
    expect(screen.getByText('req-42')).toBeInTheDocument();
  });

  it('hides the message of an error that did not come from the API', () => {
    render(<ErrorState error={new TypeError('x is undefined')} title="Couldn't load" />);

    expect(screen.queryByText('x is undefined')).not.toBeInTheDocument();
    expect(screen.getByText(/Reload the page/)).toBeInTheDocument();
  });

  it('explains a quota refusal and says precomputed results still work', () => {
    const error = new ApiError({
      status: 429,
      code: 'QUOTA_EXCEEDED',
      detail: 'Quota used up.',
      requestId: 'req-1',
      retryAfter: 5400,
    });

    render(<ErrorState error={error} title="Couldn't answer" />);

    expect(screen.getByRole('alert')).toHaveTextContent("Today's model-call quota is used up");
    expect(screen.getByText(/Precomputed scorecards/)).toHaveTextContent('in 1 h 30 min');
  });
});
