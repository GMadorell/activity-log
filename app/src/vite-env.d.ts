/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_REPO?: string
  readonly VITE_DATA_PATH?: string
  readonly VITE_GITHUB_CLIENT_ID?: string
  readonly VITE_AUTH_URL?: string
  readonly VITE_GITHUB_APP_SLUG?: string
  readonly VITE_MOCK?: string
}
