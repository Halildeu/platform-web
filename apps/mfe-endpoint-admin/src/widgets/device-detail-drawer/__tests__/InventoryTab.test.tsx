import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InventoryTab } from '../tabs/InventoryTab';
import type { EndpointCommand } from '../../../entities/endpoint-command/types';

afterEach(() => cleanup());

const baseCommand = (overrides: Partial<EndpointCommand> = {}): EndpointCommand => ({
  id: 'c-' + Math.random().toString(36).slice(2, 8),
  tenantId: 't-1',
  deviceId: 'd-1',
  type: 'COLLECT_INVENTORY',
  idempotencyKey: null,
  status: 'SUCCEEDED',
  approvalStatus: 'NOT_REQUIRED',
  payload: null,
  priority: 5,
  attemptCount: 1,
  maxAttempts: 3,
  lockedBy: null,
  lockedUntil: null,
  visibleAfterAt: null,
  expiresAt: null,
  issuedBySubject: 'admin',
  issuedAt: '2026-05-25T08:00:00Z',
  deliveredAt: '2026-05-25T08:01:00Z',
  ackedAt: '2026-05-25T08:01:30Z',
  startedAt: '2026-05-25T08:02:00Z',
  completedAt: '2026-05-25T08:05:00Z',
  cancelledAt: null,
  lastError: null,
  createdAt: '2026-05-25T08:00:00Z',
  updatedAt: '2026-05-25T08:05:00Z',
  result: null,
  ...overrides,
});

describe('InventoryTab — empty', () => {
  it('hic inventory yok iken empty placeholder + collect butonu', () => {
    const onCollect = vi.fn();
    render(
      <InventoryTab
        commands={[]}
        isDeviceOnline
        isSubmitting={false}
        onCollectInventory={onCollect}
      />,
    );
    expect(screen.getByTestId('inventory-tab-empty')).toBeInTheDocument();
    const btn = screen.getByTestId('inventory-collect-button');
    fireEvent.click(btn);
    expect(onCollect).toHaveBeenCalledTimes(1);
  });

  it('offline iken collect butonu disabled', () => {
    render(
      <InventoryTab
        commands={[]}
        isDeviceOnline={false}
        isSubmitting={false}
        onCollectInventory={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inventory-collect-button')).toBeDisabled();
  });
});

describe('InventoryTab — pending inventory', () => {
  it('aktif (RUNNING) COLLECT_INVENTORY varsa pending banner gosterir', () => {
    render(
      <InventoryTab
        commands={[baseCommand({ status: 'RUNNING', completedAt: null })]}
        isDeviceOnline
        isSubmitting={false}
        onCollectInventory={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inventory-pending-banner').textContent).toMatch(/RUNNING/);
  });

  it('FAILED durumdaki inventory pending banner gostermez', () => {
    render(
      <InventoryTab
        commands={[baseCommand({ status: 'FAILED' })]}
        isDeviceOnline
        isSubmitting={false}
        onCollectInventory={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('inventory-pending-banner')).toBeNull();
  });
});

describe('InventoryTab — successful inventory render', () => {
  it('SUCCEEDED + payload structured ile yapisal render', () => {
    const cmd = baseCommand({
      result: {
        id: 'r1',
        status: 'SUCCEEDED',
        payload: {
          localUsers: [{ name: 'admin', enabled: true, lastLogon: '2026-05-25' }],
          services: [{ name: 'svc', status: 'Running', startMode: 'Auto' }],
          systemInfo: { hostname: 'SRB-AIDENETIMPC' },
        },
        errorCode: null,
        errorMessage: null,
        exitCode: 0,
        reportedAt: '2026-05-25T08:05:00Z',
        createdAt: '2026-05-25T08:05:00Z',
      },
    });
    render(
      <InventoryTab
        commands={[cmd]}
        isDeviceOnline
        isSubmitting={false}
        onCollectInventory={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inventory-structured')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-systeminfo')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-localusers')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-services')).toBeInTheDocument();
  });

  it('Raw JSON toggle ile pre block gosterir', () => {
    const cmd = baseCommand({
      result: {
        id: 'r1',
        status: 'SUCCEEDED',
        payload: { systemInfo: { x: 1 } },
        errorCode: null,
        errorMessage: null,
        exitCode: 0,
        reportedAt: '2026-05-25T08:05:00Z',
        createdAt: '2026-05-25T08:05:00Z',
      },
    });
    render(
      <InventoryTab
        commands={[cmd]}
        isDeviceOnline
        isSubmitting={false}
        onCollectInventory={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('inventory-toggle-raw'));
    expect(screen.getByTestId('inventory-raw-json')).toBeInTheDocument();
  });

  it('unknown shape iken structured icinde fallback raw JSON gosterir', () => {
    const cmd = baseCommand({
      result: {
        id: 'r1',
        status: 'SUCCEEDED',
        payload: { unknownVendorField: 42 },
        errorCode: null,
        errorMessage: null,
        exitCode: 0,
        reportedAt: '2026-05-25T08:05:00Z',
        createdAt: '2026-05-25T08:05:00Z',
      },
    });
    render(
      <InventoryTab
        commands={[cmd]}
        isDeviceOnline
        isSubmitting={false}
        onCollectInventory={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inventory-fallback-raw')).toBeInTheDocument();
  });

  it('latest SUCCEEDED ile payload (eski FAILED gozardi)', () => {
    const oldFailed = baseCommand({
      id: 'old-failed',
      status: 'FAILED',
      completedAt: '2026-05-25T09:00:00Z',
      result: {
        id: 'r-old',
        status: 'FAILED',
        payload: null,
        errorCode: 'E1',
        errorMessage: 'agent crash',
        exitCode: 1,
        reportedAt: '2026-05-25T09:00:00Z',
        createdAt: '2026-05-25T09:00:00Z',
      },
    });
    const olderSuccess = baseCommand({
      id: 'older-success',
      status: 'SUCCEEDED',
      completedAt: '2026-05-25T08:00:00Z',
      result: {
        id: 'r-old-success',
        status: 'SUCCEEDED',
        payload: { systemInfo: { hostname: 'OLDER-SUCCESS' } },
        errorCode: null,
        errorMessage: null,
        exitCode: 0,
        reportedAt: '2026-05-25T08:00:00Z',
        createdAt: '2026-05-25T08:00:00Z',
      },
    });
    render(
      <InventoryTab
        commands={[oldFailed, olderSuccess]}
        isDeviceOnline
        isSubmitting={false}
        onCollectInventory={vi.fn()}
      />,
    );
    // older-success'in payload'i goruluyor olmali (FAILED gozardi edilmesi gerekiyor)
    expect(screen.getByTestId('inventory-systeminfo')).toBeInTheDocument();
    // Hostname is rendered as a key-value pair value
    expect(screen.getByText(/OLDER-SUCCESS/)).toBeInTheDocument();
  });
});
