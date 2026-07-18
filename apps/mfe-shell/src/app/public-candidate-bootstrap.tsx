import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import CandidateApplicationPage from '../pages/jobs/CandidateApplicationPage';
import PublicJobDetailPage from '../pages/jobs/PublicJobDetailPage';
import PublicJobsPage from '../pages/jobs/PublicJobsPage';
import CandidatePortalPage from '../pages/candidate/CandidatePortalPage';
import { normalizePublicBasePath } from './public-entry-routes';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Aday kariyer yuzeyi baslatilamadi: root elementi bulunamadi.');
}

document.documentElement.lang = 'tr';
document.title = 'Açık Pozisyonlar | Açık Kariyer';
const publicBasePath = normalizePublicBasePath(import.meta.env.BASE_URL);

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter basename={publicBasePath === '/' ? undefined : publicBasePath}>
      <Routes>
        <Route path="/candidate" element={<CandidatePortalPage />} />
        <Route path="/candidate/" element={<CandidatePortalPage />} />
        <Route path="/jobs" element={<PublicJobsPage />} />
        <Route path="/jobs/" element={<PublicJobsPage />} />
        <Route path="/jobs/:jobSlug" element={<PublicJobDetailPage />} />
        <Route path="/jobs/:jobSlug/" element={<PublicJobDetailPage />} />
        <Route path="/jobs/:jobSlug/apply" element={<CandidateApplicationPage />} />
        <Route path="/jobs/:jobSlug/apply/" element={<CandidateApplicationPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
