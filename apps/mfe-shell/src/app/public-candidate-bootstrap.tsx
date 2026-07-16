import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import CandidateApplicationPage from '../pages/jobs/CandidateApplicationPage';
import { normalizePublicBasePath } from './public-entry-routes';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Aday basvuru formu baslatilamadi: root elementi bulunamadi.');
}

document.documentElement.lang = 'tr';
document.title = 'İş Başvurusu | Açık Kariyer';
const publicBasePath = normalizePublicBasePath(import.meta.env.BASE_URL);

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter basename={publicBasePath === '/' ? undefined : publicBasePath}>
      <Routes>
        <Route path="/jobs/:jobSlug/apply" element={<CandidateApplicationPage />} />
        <Route path="/jobs/:jobSlug/apply/" element={<CandidateApplicationPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
