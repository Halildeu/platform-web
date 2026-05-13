import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { setupAgGridLicense } from '@mfe/design-system';
// PERF-INIT-V2 PR-B1a: AG Grid module registration moved out of shell
// bootstrap. Each grid-using MFE now imports the side-effect setup so the
// AG Grid Enterprise bundle (~6 MB) does NOT load with /login or /home.
// See mfe-users bootstrap comment.
import '@mfe/design-system/advanced/data-grid/setup';
import ReportingApp from './reporting/ReportingApp';
import { configureShellServices } from './services/shell-services';

// AG Grid Enterprise lisansını AgGridReact ilk render'dan ÖNCE set et.
// Module Federation singleton sharing varsayımına güvenmek yetmiyor:
// reporting MFE bootstrap path'inde license setter çağrılmazsa, shell'in
// setLicenseKey state'i ile reporting'in lazy-loaded grid bundle'ı
// arasında "trial only / invalid license" warning'i oluşuyor (canlı:
// /admin/reports/hr-compensation-detay sayfası).
setupAgGridLicense();

const container = document.getElementById('root');

if (container) {
  configureShellServices({});
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <ReportingApp />
      </BrowserRouter>
    </React.StrictMode>,
  );
}
