interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_OPTCG_MATCH_SERVER_URL?: string;
  readonly VITE_PONEGLYPH_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
