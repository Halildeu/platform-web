import type { DesignLabComponentDocEntry } from '../types';

const entry: DesignLabComponentDocEntry = {
  name: 'ApprovalEligibilityGuard',
  indexItem: {
    name: 'ApprovalEligibilityGuard',
    kind: 'component',
    availability: 'exported',
    lifecycle: 'stable',
    maturity: 'beta',
    group: 'ai_helpers',
    subgroup: 'approval_audit',
    taxonomyGroupId: 'ai_native_helpers',
    taxonomySubgroup: 'Approval / Audit',
    demoMode: 'live',
    description:
      "Onay aksiyonlarini 4-eyes / separation-of-duties / tier kurallarina gore engelleyen guard; nedenleri tooltip + opsiyonel banner ile gosterir, capture handler ile interaction'i durdurur.",
    sectionIds: ['governance_contribution', 'integration_distribution', 'documentation_standards'],
    qualityGates: [
      'design_tokens',
      'preview_visibility',
      'registry_export_sync',
      'ux_catalog_alignment',
      'a11y_keyboard_support',
    ],
    tags: ['wave-12', 'approval-foundation', 'beta', 'approval', 'governance'],
    uxPrimaryThemeId: 'ai_assisted_decision_experience',
    uxPrimarySubthemeId: 'human_approval_checkpoints',
    roadmapWaveId: 'wave_12_approval_foundation',
    acceptanceContractId: 'ui-library-wave-12-approval-foundation-v1',
    importStatement: "import { ApprovalEligibilityGuard } from '@mfe/design-system';",
    whereUsed: [],
    dependsOn: ['Tooltip', 'Text'],
  },
  apiItem: {
    name: 'ApprovalEligibilityGuard',
    variantAxes: ['variant: inline | banner', 'silentTooltip: true | false'],
    stateModel: ['eligible vs blocked', 'reason signature memoization'],
    previewStates: [
      'eligible-passthrough',
      'inline-blocked-tooltip',
      'banner-single-reason',
      'banner-multiple-reasons',
      'blocked-helpUrl',
    ],
    behaviorModel: [
      'reasons=[] passthrough rendering',
      'Capture handler intercepts click / Enter / Space',
      'onBlocked fires once per unique reason signature',
      'Banner variant renders state-warning notice above children',
    ],
    props: [
      {
        name: 'reasons',
        type: 'EligibilityReason[]',
        default: '[]',
        required: false,
        description: 'Engelleme nedenleri; bos = uygunsuz oldugu icin children passthrough.',
      },
      {
        name: 'children',
        type: 'ReactNode',
        default: '-',
        required: true,
        description: "Guard altina alinan aksiyon UI'si (genelde Button).",
      },
      {
        name: 'onBlocked',
        type: '(info: { reasons, event? }) => void',
        default: '-',
        required: false,
        description: 'Bloklu mount veya intercept edilen interaction sirasinda audit hook.',
      },
      {
        name: 'variant',
        type: "'inline' | 'banner'",
        default: 'inline',
        required: false,
        description: 'Inline = sadece tooltip; banner = ust kismda state-warning notice + tooltip.',
      },
      {
        name: 'bannerTitle',
        type: 'ReactNode',
        default: 'Bu islem icin uygun degilsin',
        required: false,
        description: 'Banner basligi.',
      },
      {
        name: 'silentTooltip',
        type: 'boolean',
        default: 'false',
        required: false,
        description: "Tooltip wrapper'i bastirir; interaction yine intercept edilir.",
      },
    ],
    previewFocus: [
      'blocked interaction interception',
      'audit telemetry firing',
      'reason listing in tooltip vs banner',
    ],
    regressionFocus: [
      'onBlocked debounced by reason signature',
      'Enter / Space key activation intercepted',
      'Eligible passthrough does not double-wrap children',
    ],
  },
};

export default entry;
