/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEETING_WORKBENCH_API_URL?: string;
  readonly VITE_MEETING_LIVE_STREAM_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
