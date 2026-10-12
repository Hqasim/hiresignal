import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AboutPage } from './about-page';

describe('AboutPage', () => {
  it('walks through the pipeline in order, ending with the human decision', () => {
    render(<AboutPage />);

    const steps = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(steps).toEqual(['Scan', 'Redact', 'Guard', 'Index', 'Screen', 'Decide']);
  });

  it('links to the source, the API reference served by the API, and the docs', () => {
    render(<AboutPage />);

    expect(screen.getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/Hqasim/hiresignal',
    );
    expect(screen.getByRole('link', { name: 'API reference (OpenAPI)' })).toHaveAttribute(
      'href',
      `${window.location.origin}/api/docs`,
    );
    expect(screen.getByRole('link', { name: 'Threat model' })).toHaveAttribute(
      'href',
      'https://github.com/Hqasim/hiresignal/blob/main/docs/threat-model.md',
    );
    expect(screen.getByRole('link', { name: 'Responsible AI' })).toHaveAttribute(
      'href',
      'https://github.com/Hqasim/hiresignal/blob/main/docs/responsible-ai.md',
    );
    expect(screen.getByRole('link', { name: 'Evals and results' })).toHaveAttribute(
      'href',
      'https://github.com/Hqasim/hiresignal/blob/main/docs/evals.md',
    );
  });
});
