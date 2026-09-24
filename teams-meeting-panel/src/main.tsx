import React from 'react';
import { createRoot } from 'react-dom/client';
import { app } from '@microsoft/teams-js';
import { Panel } from './Panel';
import { loadConfig } from './config';
import './style.css';

const root = createRoot(document.getElementById('root')!);
root.render(<main><p role="status">Toplantı paneli açılıyor…</p></main>);
void Promise.all([app.initialize(), loadConfig()]).then(([, config]) => {
  root.render(<React.StrictMode><Panel config={config} /></React.StrictMode>);
}).catch(() => {
  root.render(<main><h1>Toplantı paneli açılamadı</h1><p>Panelin Teams uygulamasına eklenmiş ve kurum tarafından yapılandırılmış olması gerekiyor.</p></main>);
});
