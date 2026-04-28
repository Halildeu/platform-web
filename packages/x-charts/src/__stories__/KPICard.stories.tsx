import React from 'react';
import { KPICard } from '../KPICard';
import { SparklineChart } from '../SparklineChart';

/* ------------------------------------------------------------------ */
/*  Visual-test wrapper (matches AllChartTypes.stories.tsx pattern)    */
/* ------------------------------------------------------------------ */

const VISUAL_BOX_STYLE: React.CSSProperties = {
  width: 320,
  height: 180,
  background: '#ffffff',
  padding: 16,
};

function VisualBox(props: { id: string; children: React.ReactNode }) {
  return (
    <div data-testid={`x-charts-${props.id}`} style={VISUAL_BOX_STYLE}>
      {props.children}
    </div>
  );
}

export const Default = () => (
  <VisualBox id="kpicard-default">
    <KPICard title="Users" value="12,847" />
  </VisualBox>
);

export const WithTrend = () => (
  <VisualBox id="kpicard-with-trend">
    <KPICard
      title="Revenue"
      value="$128,500"
      trend={{ direction: 'up', value: '+12.5%', positive: true }}
    />
  </VisualBox>
);

export const WithChart = () => (
  <VisualBox id="kpicard-with-chart">
    <KPICard
      title="Active Sessions"
      value="1,234"
      trend={{ direction: 'up', value: '+3.2%', positive: true }}
      chart={<SparklineChart data={[10, 12, 8, 15, 13, 17, 20]} type="area" />}
    />
  </VisualBox>
);

export default { title: 'X-Charts/KPICard', component: KPICard };
