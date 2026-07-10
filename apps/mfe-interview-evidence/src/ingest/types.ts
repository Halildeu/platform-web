/**
 * F1/F2 rıza + kayıt-yükleme tipleri (ATS kanonik sözleşmenin UI-yüzü).
 * 39d'de `/api/ats` DTO'larına bağlanır; şimdilik demo motoru kullanır.
 */
export type ConsentState = 'GRANTED' | 'DENIED' | 'WITHDRAWN';

export interface IngestReceipt {
  objectKey: string;
  evidenceId: string;
  ledgerSequence: number;
}

export interface TranscribeReceipt {
  transcriptKey: string;
}
