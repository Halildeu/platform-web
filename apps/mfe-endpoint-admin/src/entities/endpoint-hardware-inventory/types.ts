/**
 * WEB-013 — Hardware inventory entity types (Faz 22.5.2 / 22.5.5
 * frontend closure). Codex 019e70ce plan-time PARTIAL AGREE absorb.
 *
 * Wire shape is BE-022Q's
 * {@code AdminHardwareInventorySnapshotResponse}. Field names match
 * the backend record component names exactly so the RTK Query slice
 * does not need a mapping layer.
 */

import type { SpringPage } from '../endpoint-software-catalog/types';

/** Disk media type enum. Backend enum: SSD / HDD / NVME / UNKNOWN. */
export type HardwareInventoryDiskMediaType = 'SSD' | 'HDD' | 'NVME' | 'UNKNOWN';

/** Disk bus type enum. Backend enum: SATA / NVME / USB / SCSI / IDE / UNKNOWN. */
export type HardwareInventoryDiskBusType = 'SATA' | 'NVME' | 'USB' | 'SCSI' | 'IDE' | 'UNKNOWN';

/**
 * Network interface type enum. Backend enum:
 * ETHERNET / WIFI / LOOPBACK / VIRTUAL / UNKNOWN.
 */
export type HardwareInventoryInterfaceType =
  | 'ETHERNET'
  | 'WIFI'
  | 'LOOPBACK'
  | 'VIRTUAL'
  | 'UNKNOWN';

/** Network interface link state enum. Backend enum: UP / DOWN / UNKNOWN. */
export type HardwareInventoryLinkState = 'UP' | 'DOWN' | 'UNKNOWN';

export interface HardwareInventoryDisk {
  devicePath: string | null;
  model: string | null;
  mediaType: HardwareInventoryDiskMediaType | null;
  busType: HardwareInventoryDiskBusType | null;
  capacityBytes: number | null;
  freeBytes: number | null;
  removable: boolean | null;
}

export interface HardwareInventoryNetworkInterface {
  name: string | null;
  macAddress: string | null;
  interfaceType: HardwareInventoryInterfaceType | null;
  linkState: HardwareInventoryLinkState | null;
  ipAddresses: string[];
}

export interface HardwareInventoryProbeError {
  code: string | null;
  summary: string | null;
}

export interface HardwareInventorySnapshot {
  id: string;
  tenantId: string;
  deviceId: string;
  sourceCommandResultId: string | null;
  schemaVersion: number;
  supported: boolean;
  cpuModel: string | null;
  cpuCores: number | null;
  cpuFrequencyMhz: number | null;
  ramTotalBytes: number | null;
  ramAvailableBytes: number | null;
  osName: string | null;
  osVersion: string | null;
  osKernel: string | null;
  osArch: string | null;
  biosVendor: string | null;
  biosVersion: string | null;
  manufacturer: string | null;
  systemModel: string | null;
  domainJoined: boolean | null;
  domainName: string | null;
  lastBootAt: string | null;
  payloadHashSha256: string;
  collectedAt: string;
  createdAt: string;
  disks: HardwareInventoryDisk[];
  networkInterfaces: HardwareInventoryNetworkInterface[];
  probeErrors: HardwareInventoryProbeError[];
}

/**
 * History-summary projection — no children, surfaces child counts.
 * Used by the WEB-013 history accordion list view.
 */
export interface HardwareInventorySnapshotSummary {
  id: string;
  deviceId: string;
  schemaVersion: number;
  supported: boolean;
  cpuModel: string | null;
  ramTotalBytes: number | null;
  osName: string | null;
  osVersion: string | null;
  diskCount: number;
  networkInterfaceCount: number;
  probeErrorCount: number;
  payloadHashSha256: string;
  collectedAt: string;
  createdAt: string;
}

export interface GetDeviceHardwareInventoryLatestArgs {
  deviceId: string;
}

export interface GetDeviceHardwareInventoryHistoryArgs {
  deviceId: string;
  page?: number;
  size?: number;
}

/** Spring Page envelope per BE-022Q. */
export type HardwareInventoryHistoryPage = SpringPage<HardwareInventorySnapshotSummary>;
