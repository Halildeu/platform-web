/* Turkey-ISG (İş Sağlığı ve Güvenliği) domain components.
 *
 * Components in this folder are specific to Turkish occupational health and
 * safety regulations (e.g. ISG Kanunu 5x5 risk matrix, Fine-Kinney method).
 * They are intentionally kept on the enterprise/ surface (not adopted into
 * generic components/ or patterns/) because their props, scoring rules,
 * and locale defaults are regulation-bound and not generally applicable.
 */
export { FineKinney } from './FineKinney';
export type {
  FineKinneyProbability,
  FineKinneyFrequency,
  FineKinneySeverity,
  FineKinneyRisk,
  FineKinneyLocaleText,
  FineKinneyProps,
} from './FineKinney';
