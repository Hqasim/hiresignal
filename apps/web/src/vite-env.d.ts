/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API, baked in at build time (the Lambda Function URL). Empty locally: Vite proxies /api. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
