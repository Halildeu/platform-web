/* eslint-disable semantic-theme/no-inline-color-literals -- WEB-017 iter-1 ship; semantic token migration in WEB-017 iter-2 follow-up. */
import React from 'react';

import { endpointAdminApi } from '../../app/services/endpointAdminApi';
import type { CreateEndpointEnrollmentResponse } from '../../entities/endpoint-enrollment/types';
import { useEndpointAdminI18n } from '../../i18n';

const MIN_MINUTES = 1;
const MAX_MINUTES = 10080;
const DEFAULT_MINUTES = 60;
const NOTE_MAX_LENGTH = 512;

export interface CreateEnrollmentDialogProps {
  open: boolean;
  canManage: boolean;
  onClose: () => void;
  onCreated: (response: CreateEndpointEnrollmentResponse) => void;
}

export const CreateEnrollmentDialog: React.FC<CreateEnrollmentDialogProps> = ({
  open,
  canManage,
  onClose,
  onCreated,
}) => {
  const { t } = useEndpointAdminI18n();
  const [expiresInMinutes, setExpiresInMinutes] = React.useState(DEFAULT_MINUTES);
  const [note, setNote] = React.useState('');
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const [createEnrollment, createState] = endpointAdminApi.useCreateEndpointEnrollmentMutation();

  React.useEffect(() => {
    if (!open) {
      setExpiresInMinutes(DEFAULT_MINUTES);
      setNote('');
      setValidationError(null);
      createState.reset();
    }
  }, [open, createState]);

  if (!open) {
    return null;
  }

  if (!canManage) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        data-testid="create-enrollment-dialog-forbidden"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 480 }}>
          <h2>{t('endpointAdmin.enrollments.dialog.forbiddenTitle')}</h2>
          <p>{t('endpointAdmin.enrollments.dialog.forbiddenBody')}</p>
          <button type="button" onClick={onClose}>
            {t('endpointAdmin.enrollments.dialog.close')}
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError(null);

    if (
      !Number.isFinite(expiresInMinutes) ||
      expiresInMinutes < MIN_MINUTES ||
      expiresInMinutes > MAX_MINUTES
    ) {
      setValidationError(t('endpointAdmin.enrollments.dialog.errorExpiresRange'));
      return;
    }
    if (note.length > NOTE_MAX_LENGTH) {
      setValidationError(t('endpointAdmin.enrollments.dialog.errorNoteLength'));
      return;
    }

    try {
      const response = await createEnrollment({
        expiresInMinutes,
        note: note.trim() ? note.trim() : undefined,
      }).unwrap();
      onCreated(response);
      // Codex iter-1 reveal-once UX: clear local state immediately and
      // reset the RTK Query mutation cache so the raw token does not
      // linger anywhere outside the modal closure.
      setNote('');
      setExpiresInMinutes(DEFAULT_MINUTES);
      createState.reset();
    } catch {
      setValidationError(t('endpointAdmin.enrollments.dialog.errorGeneric'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-enrollment-dialog-title"
      data-testid="create-enrollment-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 480, width: '90%' }}
      >
        <h2 id="create-enrollment-dialog-title">{t('endpointAdmin.enrollments.dialog.title')}</h2>

        <label htmlFor="expiresInMinutes" style={{ display: 'block', marginTop: 12 }}>
          {t('endpointAdmin.enrollments.dialog.expiresLabel')} ({MIN_MINUTES}-{MAX_MINUTES})
        </label>
        <input
          id="expiresInMinutes"
          type="number"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          value={expiresInMinutes}
          onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
          data-testid="create-enrollment-dialog-expires-input"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />

        <label htmlFor="note" style={{ display: 'block', marginTop: 12 }}>
          {t('endpointAdmin.enrollments.dialog.noteLabel')} (max {NOTE_MAX_LENGTH})
        </label>
        <textarea
          id="note"
          maxLength={NOTE_MAX_LENGTH}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid="create-enrollment-dialog-note-input"
          rows={3}
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />

        {validationError && (
          <p
            data-testid="create-enrollment-dialog-error"
            style={{ color: '#b00020', marginTop: 12 }}
          >
            {validationError}
          </p>
        )}

        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <button
            type="button"
            data-testid="create-enrollment-dialog-cancel"
            onClick={onClose}
            disabled={createState.isLoading}
            style={{ marginRight: 8 }}
          >
            {t('endpointAdmin.enrollments.dialog.cancel')}
          </button>
          <button
            type="submit"
            data-testid="create-enrollment-dialog-submit"
            disabled={createState.isLoading}
          >
            {createState.isLoading
              ? t('endpointAdmin.enrollments.dialog.submitting')
              : t('endpointAdmin.enrollments.dialog.submit')}
          </button>
        </div>
      </form>
    </div>
  );
};
