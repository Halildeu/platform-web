import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { selectReportingCompany } from '../../components/CompanyPicker';
import { BudgetApiError, fetchCompanies, fetchProjects } from './api';
import type { CompanyOption, ProjectOption } from './types';

const today = new Date();
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const currentYearStart = `${today.getFullYear()}-01-01`;

const errorMessage = (error: unknown): string =>
  error instanceof BudgetApiError
    ? error.message
    : 'Beklenmeyen bir hata oluştu. Kaynak veride değişiklik yapılmadı.';

const companyLabel = (company: CompanyOption): string => {
  const name = company.name?.trim();
  const nickname = company.nickname?.trim();
  if (nickname && name) return `${nickname} — ${name}`;
  return name || nickname || 'Adsız şirket';
};

const projectLabel = (project: ProjectOption): string => {
  const prefix = project.code?.trim();
  const label = prefix ? `${prefix} — ${project.name}` : project.name;
  return project.active ? label : `${label} (pasif)`;
};

export const BudgetWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reportingRoot = location.pathname.startsWith('/admin/reports')
    ? '/admin/reports'
    : '/reports';

  const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [companyId, setCompanyId] = React.useState('');
  const [projectId, setProjectId] = React.useState('');
  const [from, setFrom] = React.useState(currentYearStart);
  const [to, setTo] = React.useState(isoDate(today));
  const [catalogBusy, setCatalogBusy] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    void fetchCompanies()
      .then((items) => {
        if (active) setCompanies(items);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setCatalogBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const onCompanyChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    setCompanyId(next);
    setProjectId('');
    setProjects([]);
    setError(null);
    if (!next) return;

    setCatalogBusy(true);
    try {
      setProjects(await fetchProjects(Number(next)));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setCatalogBusy(false);
    }
  };

  const openAccountingDetail = () => {
    if (!companyId || !projectId || !from || !to || from > to) return;
    selectReportingCompany(companyId);
    const params = new URLSearchParams({
      projectId,
      dateFrom: from,
      dateTo: to,
    });
    navigate(
      `${reportingRoot}/fin-proje-muhasebe-gercekleseni?${params.toString()}`,
    );
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => navigate(reportingRoot)}
          >
            ← Raporlar
          </button>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Ayrı ürün · salt okunur ERP kaynağı
          </p>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">
            Proje bazlı gerçekleşen ve kaynak belge
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-text-secondary">
            Şirketi adıyla, projeyi kodu ve adıyla seçin. Muhasebe Detay ile aynı AG Grid
            görünümünde fişten faturaya, masrafa, siparişe, banka hareketine veya virmana
            kadar kanıtlanabilen kaynak zincirini inceleyin.
          </p>
        </div>
        <span className="rounded-full border border-state-success-text/30 bg-state-success-bg px-3 py-1 text-xs font-semibold text-state-success-text">
          MSSQL / ERP salt okunur
        </span>
      </header>

      <section
        aria-label="Gerçekleşen maliyet seçimi"
        className="rounded-xl border border-border-subtle bg-surface-default p-5 shadow-sm"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Şirket adı</span>
            <select
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={companyId}
              onChange={onCompanyChange}
              disabled={catalogBusy && companies.length === 0}
            >
              <option value="">
                {catalogBusy && companies.length === 0 ? 'Yükleniyor…' : 'Şirket seçin'}
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {companyLabel(company)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Proje</span>
            <select
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={!companyId || catalogBusy}
            >
              <option value="">
                {!companyId
                  ? 'Önce şirket seçin'
                  : catalogBusy
                    ? 'Projeler yükleniyor…'
                    : 'Proje seçin'}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {projectLabel(project)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Başlangıç tarihi</span>
            <input
              type="date"
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-text-primary">
            <span>Bitiş tarihi</span>
            <input
              type="date"
              className="w-full rounded-md border border-border-subtle bg-surface-default px-3 py-2"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            Tarih yalnız rapor filtresidir; bütçe kimliği projedir. Kaynak eşleşmeyen
            satırlar tahmin edilmeden ayrıca işaretlenir.
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!companyId || !projectId || !from || !to || from > to}
            onClick={openAccountingDetail}
          >
            AG Grid detayını aç
          </button>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-state-danger-text/30 bg-state-danger-bg p-4 text-sm text-state-danger-text"
        >
          <strong>Veri gösterilemedi.</strong> {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-state-warning-text/30 bg-state-warning-bg p-4 text-sm text-text-primary">
        <strong>Maliyet sınıflaması kontrollü ilerleyecek.</strong> Bu ilk görünüm seçilen
        projenin muhasebe gerçekleşenini ve kaynak belgesini gösterir. Hangi hesapların
        bütçe maliyeti sayılacağı kural setiyle belirlenecek; AI yalnız kod önerisi
        üretecek, ERP veya bütçe kaydını kendiliğinden değiştirmeyecek.
      </section>
    </div>
  );
};

export default BudgetWorkspace;
