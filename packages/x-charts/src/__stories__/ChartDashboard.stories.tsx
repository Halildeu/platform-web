import React from 'react';
import { ChartDashboard } from '../ChartDashboard';
import { KPICard } from '../KPICard';
import { SparklineChart } from '../SparklineChart';
import { StatWidget } from '../StatWidget';

/* ------------------------------------------------------------------ */
/*  Visual-test wrapper (matches AllChartTypes.stories.tsx pattern)    */
/* ------------------------------------------------------------------ */

const VISUAL_BOX_STYLE: React.CSSProperties = {
  width: 1024,
  height: 200,
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

export const FourColumnKPIs = () => (
  <VisualBox id="chartdashboard-four-column-kpis">
    <ChartDashboard columns={4} gap="md">
      <KPICard
        title="Users"
        value="12,847"
        trend={{ direction: 'up', value: '+12%', positive: true }}
        chart={<SparklineChart data={[10, 12, 8, 15, 13, 17, 20]} type="area" />}
      />
      <KPICard
        title="Sessions"
        value="1,234"
        trend={{ direction: 'up', value: '+3%', positive: true }}
        chart={<SparklineChart data={[5, 8, 6, 9, 7, 11, 12]} type="line" />}
      />
      <KPICard
        title="Error Rate"
        value="0.12%"
        trend={{ direction: 'down', value: '-0.03%', positive: true }}
        chart={<SparklineChart data={[3, 2, 4, 1, 2, 1, 1]} type="bar" />}
      />
      <KPICard
        title="Latency"
        value="142ms"
        trend={{ direction: 'down', value: '-8ms', positive: true }}
        chart={<SparklineChart data={[180, 165, 150, 155, 148, 145, 142]} type="line" />}
      />
    </ChartDashboard>
  </VisualBox>
);

export const StatWidgets = () => (
  <VisualBox id="chartdashboard-stat-widgets">
    <ChartDashboard columns={3} gap="md">
      <StatWidget label="API Calls" value={45230} previousValue={42100} format="number" />
      <StatWidget
        label="Revenue"
        value={128500}
        previousValue={115000}
        format="currency"
        prefix="₺"
      />
      <StatWidget label="Conversion" value={0.0342} previousValue={0.031} format="percent" />
    </ChartDashboard>
  </VisualBox>
);

export default { title: 'X-Charts/ChartDashboard', component: ChartDashboard };
