/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Origin of the API, such as https://api.example.com. Unset: the page's own origin, where the
  // Vite proxy (development) or nginx (production) forwards /api to the API.
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
