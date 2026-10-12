/** The public repository, linked from the footer and the About page. */
export const REPO_URL = 'https://github.com/Hqasim/hiresignal';

/**
 * Links to a file in the repository as GitHub renders it on `main`.
 *
 * @example
 * repoFileUrl('docs/evals.md'); // 'https://github.com/Hqasim/hiresignal/blob/main/docs/evals.md'
 */
export function repoFileUrl(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}
