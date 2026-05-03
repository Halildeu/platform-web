/**
 * Theme collision defaults — contract test
 *
 * Codex 019defa5 plan-time review: every theme builder (light, dark,
 * high-contrast, print) must ship the same baseline collision defaults
 * so wrappers that drop down to a different theme don't lose
 * `axisLabel.hideOverlap`, `legend.type:'scroll'`, or `tooltip.confine`.
 */

import { describe, it, expect } from 'vitest';
import { buildDesignLabEChartsTheme } from '../DesignLabEChartsTheme';
import { buildDesignLabEChartsDarkTheme } from '../DesignLabEChartsDarkTheme';
import { buildDesignLabEChartsHighContrastTheme } from '../DesignLabEChartsHighContrastTheme';
import { buildDesignLabEChartsPrintTheme } from '../DesignLabEChartsPrintTheme';

const builders = [
  { name: 'light', build: () => buildDesignLabEChartsTheme() },
  { name: 'dark', build: () => buildDesignLabEChartsDarkTheme() },
  { name: 'high-contrast', build: () => buildDesignLabEChartsHighContrastTheme() },
  { name: 'print', build: () => buildDesignLabEChartsPrintTheme() },
] as const;

type ThemeShape = ReturnType<typeof buildDesignLabEChartsTheme>;

describe('theme collision defaults — contract', () => {
  for (const { name, build } of builders) {
    describe(`${name} theme`, () => {
      const theme = build() as ThemeShape & {
        legend?: { type?: string };
        tooltip?: { confine?: boolean };
        categoryAxis?: { axisLabel?: { hideOverlap?: boolean } };
        valueAxis?: { axisLabel?: { hideOverlap?: boolean } };
      };

      it('legend defaults to scroll mode', () => {
        expect(theme.legend?.type).toBe('scroll');
      });

      it('tooltip is confined to the chart bounding box', () => {
        expect(theme.tooltip?.confine).toBe(true);
      });

      it('categoryAxis labels enable hideOverlap', () => {
        expect(theme.categoryAxis?.axisLabel?.hideOverlap).toBe(true);
      });

      it('valueAxis labels enable hideOverlap', () => {
        expect(theme.valueAxis?.axisLabel?.hideOverlap).toBe(true);
      });
    });
  }
});
