import { describe, expect, test } from 'vitest';
import {
  INTEGRATION_PLATFORM_PUBLIC_REGISTRY,
  INTEGRATION_PLATFORM_SAMPLE_SHA256,
  INTEGRATION_PLATFORM_SOURCE_COMMIT,
  parseIntegrationPlatformRegistry,
} from './integrationPlatformContract';

type MutableRecord = Record<string, unknown>;

function mutableFixture(): MutableRecord {
  return JSON.parse(JSON.stringify(INTEGRATION_PLATFORM_PUBLIC_REGISTRY)) as MutableRecord;
}

function records(value: unknown): MutableRecord[] {
  return value as MutableRecord[];
}

function record(value: unknown): MutableRecord {
  return value as MutableRecord;
}

function expectRejected(input: unknown, message: RegExp): void {
  const result = parseIntegrationPlatformRegistry(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors.join('\n')).toMatch(message);
}

describe('integration-platform/v1 browser contract boundary', () => {
  test('canonical source pin and exact public fixture produce an owned deep-frozen 6/3 model', () => {
    expect(INTEGRATION_PLATFORM_SOURCE_COMMIT).toBe('584fb1a407c926189fd8db7ee8b2028d5672d55a');
    expect(INTEGRATION_PLATFORM_SAMPLE_SHA256).toBe(
      '71eface856d0b77c5d11130dae21032f3a44f5d71106751aad6c7b4060343d32',
    );

    const input = mutableFixture();
    const result = parseIntegrationPlatformRegistry(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.schemaVersion).toBe('integration-platform/v1');
    expect(result.value.activationGate).toBe('PRE_G0_CONTRACT_ONLY');
    expect(result.value.connectors).toHaveLength(6);
    expect(result.value.syntheticEnvelopes).toHaveLength(3);
    expect(result.value.connectors.map((connector) => connector.domain)).toEqual([
      'ATS',
      'HRIS',
      'CALENDAR_EMAIL',
      'SSO_SCIM',
      'PORTABILITY',
      'DISTRIBUTION',
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.connectors)).toBe(true);
    expect(Object.isFrozen(result.value.connectors[0]?.mutationPolicy)).toBe(true);

    records(input.connectors)[0]!.connector_id = 'poisoned-after-parse';
    expect(result.value.connectors[0]?.connectorId).toBe('generic-ats-v1');
  });

  test('schema, gate, exact cardinality and PRE-G0 verification fail closed', () => {
    const schema = mutableFixture();
    schema.schema_version = 'integration-platform/v9';
    expectRejected(schema, /schema_version/);

    const gate = mutableFixture();
    gate.activation_gate = 'G0_ACCEPTED_RUNTIME';
    expectRejected(gate, /activation_gate/);

    const cardinality = mutableFixture();
    records(cardinality.connectors).pop();
    expectRejected(cardinality, /exactly six connectors/);

    const verified = mutableFixture();
    records(verified.connectors)[0]!.verification_status = 'VERIFIED';
    records(verified.connectors)[0]!.api_verified = true;
    records(verified.connectors)[0]!.activation_evidence = { verifier_ref: 'owner.synthetic' };
    expectRejected(verified, /VERIFIED forbidden|api_verified|activation_evidence/);
  });

  test('canonical domain profile rejects order, ownership and reliability drift', () => {
    const operationOrder = mutableFixture();
    const operations = records(operationOrder.connectors)[0]!.operations as unknown[];
    operations.reverse();
    expectRejected(operationOrder, /canonical order or domain authority mismatch/);

    const dataClassOrder = mutableFixture();
    const dataClasses = records(dataClassOrder.connectors)[0]!.data_classes as unknown[];
    dataClasses.reverse();
    expectRejected(dataClassOrder, /canonical order or domain authority mismatch/);

    const ownership = mutableFixture();
    record(records(ownership.connectors)[0]!.transfer_policy).retention_owner = 'SOURCE_SYSTEM';
    expectRejected(ownership, /retention_owner: canonical domain profile mismatch/);

    const reliability = mutableFixture();
    record(records(reliability.connectors)[4]!.reliability).replay_window_seconds = 301;
    expectRejected(reliability, /replay_window_seconds: canonical domain profile mismatch/);
  });

  test('duplicate identity and cross-connector envelope laundering fail closed', () => {
    const duplicate = mutableFixture();
    records(duplicate.connectors)[1]!.connector_id = 'generic-ats-v1';
    expectRejected(
      duplicate,
      /connector_id: canonical domain profile mismatch|duplicate connector_id/,
    );

    const operation = mutableFixture();
    records(operation.synthetic_envelopes)[0]!.operation = 'pull_worker_ref';
    expectRejected(operation, /cross-connector operation laundering/);

    const dataClass = mutableFixture();
    records(dataClass.synthetic_envelopes)[0]!.data_classes = ['worker_ref'];
    expectRejected(dataClass, /cross-connector data-class laundering/);
  });

  test('mutation approval, tenant idempotency and signed-webhook replay are mandatory', () => {
    const approval = mutableFixture();
    delete records(approval.synthetic_envelopes)[0]!.human_approval_ref;
    expectRejected(approval, /mutating operation approval required/);

    const idempotency = mutableFixture();
    records(idempotency.synthetic_envelopes)[0]!.idempotency_key = 'another-tenant:operation:1';
    expectRejected(idempotency, /tenant-scoped prefix required/);

    const replay = mutableFixture();
    record(records(replay.connectors)[4]!.reliability).replay_window_seconds = 0;
    expectRejected(replay, /positive replay window|signed webhook replay window|required/);
  });

  test('raw PII, credential, decision and payload fields or values never enter the model', () => {
    for (const forbidden of [
      ['candidate_email', 'person@example.com'],
      ['accessToken', 'secret-value'],
      ['candidateRank', 1],
      ['raw_payload', 'opaque-looking-but-raw'],
    ] as const) {
      const input = mutableFixture();
      records(input.synthetic_envelopes)[0]![forbidden[0]] = forbidden[1];
      expectRejected(input, /forbidden raw PII, credential or decision field/);
    }

    const rawValue = mutableFixture();
    records(rawValue.synthetic_envelopes)[0]!.correlation_id = 'person@example.com';
    expectRejected(rawValue, /forbidden raw PII, credential or decision value/);
  });

  test.each(['Ada.Lovelace', 'api_key:supersecret', 'REJECT'])(
    'generic-looking event ref %s canonical envelope profiline sizamaz',
    (eventId) => {
      const input = mutableFixture();
      records(input.synthetic_envelopes)[0]!.event_id = eventId;
      expectRejected(input, /event_id: canonical envelope profile mismatch/);
    },
  );

  test.each(['Ada.Lovelace', 'api_key:supersecret', 'REJECT'])(
    'compound fail-closed diagnostigi untrusted event ref %s degerini yansitmaz',
    (eventId) => {
      const input = mutableFixture();
      records(input.synthetic_envelopes)[0]!.event_id = eventId;
      records(input.synthetic_envelopes)[0]!.operation = 'pull_worker_ref';

      const result = parseIntegrationPlatformRegistry(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const diagnostics = result.errors.join('\n');
        expect(diagnostics).not.toContain(eventId);
        expect(diagnostics).toContain('$.synthetic_envelopes[0].operation');
      }
    },
  );

  test('accessors, cycles, shared references, hostile prototypes and excessive depth fail closed', () => {
    const accessor = mutableFixture();
    let getterCalls = 0;
    Object.defineProperty(accessor, 'activation_gate', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'PRE_G0_CONTRACT_ONLY';
      },
    });
    expectRejected(accessor, /accessor or hidden value is forbidden/);
    expect(getterCalls).toBe(0);

    const cyclic = mutableFixture();
    cyclic.cycle = cyclic;
    expectRejected(cyclic, /repeated or cyclic object reference/);

    const shared = mutableFixture();
    const connectorList = records(shared.connectors);
    connectorList[1] = connectorList[0]!;
    expectRejected(shared, /repeated or cyclic object reference/);

    const hostile = Object.assign(
      Object.create({ poisoned: true }) as MutableRecord,
      mutableFixture(),
    );
    expectRejected(hostile, /non-plain object prototype/);

    const deep = mutableFixture();
    let cursor = deep;
    for (let index = 0; index < 20; index += 1) {
      cursor.extra = {};
      cursor = record(cursor.extra);
    }
    expectRejected(deep, /depth budget exceeded/);
  });

  test('unknown fields and prototype-pollution keys do not degrade to a partial catalog', () => {
    const unknown = mutableFixture();
    unknown.optimistic_fallback = true;
    expectRejected(unknown, /unknown field/);

    const polluted = mutableFixture();
    Object.defineProperty(polluted, '__proto__', {
      enumerable: true,
      configurable: true,
      writable: true,
      value: { polluted: true },
    });
    expectRejected(polluted, /prototype pollution key is forbidden/);
  });
});
