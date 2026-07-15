import React, { useState } from 'react';
import type { AtsSafePreview } from '../model/ats-capability-registry';

interface SafeScenarioRunnerProps {
  capabilityId: string;
  actionLabel: string;
  preview: AtsSafePreview;
}

/**
 * Local-only, resettable product exercise for proposal/sandbox capabilities.
 * It deliberately performs no fetch, storage write or downstream mutation.
 */
const SafeScenarioRunner: React.FC<SafeScenarioRunnerProps> = ({
  capabilityId,
  actionLabel,
  preview,
}) => {
  const [opened, setOpened] = useState(false);
  const [completed, setCompleted] = useState(false);
  const panelId = `ats-safe-scenario-${capabilityId}`;

  const closeAndReset = () => {
    setOpened(false);
    setCompleted(false);
  };

  return (
    <div className="mt-4" data-testid={`ats-safe-runner-${capabilityId}`}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-lg border border-action-primary px-4 py-2 text-sm font-semibold text-action-primary underline-offset-4 hover:bg-action-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        aria-expanded={opened}
        aria-controls={panelId}
        onClick={() => (opened ? closeAndReset() : setOpened(true))}
      >
        {opened ? 'Güvenli denemeyi kapat' : actionLabel}
      </button>

      {opened ? (
        <section
          id={panelId}
          className="mt-3 space-y-3 rounded-xl border border-state-info-border bg-state-info-bg p-4 text-sm"
          aria-label={`${actionLabel} sentetik çalışma alanı`}
        >
          <div>
            <h4 className="font-semibold text-text-primary">Sentetik senaryo</h4>
            <p className="mt-1 text-text-secondary">{preview.scenario}</p>
          </div>

          {!completed ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg bg-action-primary px-4 py-2 font-semibold text-action-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              onClick={() => setCompleted(true)}
              data-testid={`ats-safe-run-${capabilityId}`}
            >
              Sentetik çıktıyı üret
            </button>
          ) : (
            <div className="space-y-3" role="status" aria-live="polite">
              <div className="rounded-lg border border-border-subtle bg-surface-default p-3">
                <h4 className="font-semibold text-text-primary">Salt-okunur örnek çıktı</h4>
                <p className="mt-1 text-text-secondary">{preview.output}</p>
              </div>
              <div className="rounded-lg border border-state-warning-border bg-state-warning-bg p-3">
                <h4 className="font-semibold text-text-primary">Güvenlik sınırı</h4>
                <p className="mt-1 text-text-secondary">{preview.boundary}</p>
              </div>
              <p className="font-medium text-text-secondary">
                Bu deneme tarayıcı belleğinde çalıştı; ağ isteği, kayıt, bildirim veya karar
                üretilmedi.
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle bg-surface-default px-4 py-2 font-semibold text-text-primary underline-offset-4 hover:bg-surface-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                onClick={() => setCompleted(false)}
              >
                Denemeyi sıfırla
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default SafeScenarioRunner;
