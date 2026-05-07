/**
 * Backend DTO mirror — `EndpointAgentServiceStatusDto` (record).
 *
 * Source-of-truth (e9cb8dd0):
 *   platform-backend / endpoint-admin-service /
 *     src/main/java/com/example/endpointadmin/dto/v1/EndpointAgentServiceStatusDto.java
 *
 * Field shape and types intentionally match the Java record. `timestamp`
 * is ISO-8601 string on the wire (Jackson default for `Instant`).
 */
export interface EndpointAgentServiceStatus {
  service: string;
  status: string;
  apiVersion: string;
  deviceCredentialProvider: string;
  /** ISO-8601 timestamp from `Instant`. */
  timestamp: string;
}
