import { describe, expect, it } from 'vitest';

import { REPO_URL, repoFileUrl } from './links';

describe('repoFileUrl', () => {
  it('links a repository path to its rendered page on main', () => {
    expect(repoFileUrl('docs/responsible-ai.md')).toBe(
      `${REPO_URL}/blob/main/docs/responsible-ai.md`,
    );
  });
});
