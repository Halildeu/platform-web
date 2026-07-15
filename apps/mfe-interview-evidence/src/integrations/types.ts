export type ConnectorCategory = 'ATS' | 'HRIS' | 'CALENDAR_EMAIL' | 'SSO_SCIM' | 'CSV_API_WEBHOOK';

export type ConnectorVerificationStatus = 'UNVERIFIED' | 'VERIFIED' | 'BLOCKED' | 'NOT_CONFIGURED';

export type ConnectorCapability = 'READ' | 'TEST' | 'WRITE' | 'PROVISION';

export interface SyntheticConnectorDefinition {
  schemaVersion: 'p4.integration-catalog.v1';
  id: string;
  name: string;
  category: ConnectorCategory;
  description: string;
  status: ConnectorVerificationStatus;
  apiVerified: boolean;
  capabilities: readonly ConnectorCapability[];
  statusReason: string;
}

export interface SyntheticFieldMapping {
  source: string;
  target: string;
  classification: 'NON_PII' | 'PII' | 'EVIDENCE_METADATA';
  transferMode: 'PREVIEW_ONLY';
  enabled: false;
}
