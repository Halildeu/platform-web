import React from 'react';
import { Button } from '@mfe/design-system';
import { Input } from '@mfe/design-system';
import { Card, CardHeader, CardBody } from '@mfe/design-system';
import { Badge } from '@mfe/design-system';
import { Checkbox } from '@mfe/design-system';
import { Switch } from '@mfe/design-system';

/**
 * Shared invariant matrix canvas (PR-3, Codex thread 019df8eb).
 *
 * Renders a fixed showcase of DS primitives + form controls + surface
 * elements. Each matrix story file (Theme/Focus/Density/RTL) sets the
 * relevant root-level attributes (`data-mode`, `data-density`, `dir`)
 * on the canvas root and snapshots the entire matrix as ONE image.
 *
 * The component-level snapshot fan-out is what L4 prevents — token
 * change, theme switch, density swap, or RTL flip produces ONE diff
 * per matrix, not one per primitive. See ADR §L4.
 *
 * The contents below are deliberately minimal: enough primitives to
 * reveal token-level regressions (color, focus ring, spacing, type
 * direction), not so many that every minor primitive change touches
 * every matrix.
 */
export interface MatrixCanvasProps {
  mode?: 'light' | 'dark';
  density?: 'compact' | 'comfortable' | 'spacious';
  dir?: 'ltr' | 'rtl';
  /**
   * Force focus on the first interactive element. Used by FocusMatrix
   * to reveal focus ring tokens; Theme/Density/RTL stories leave it off.
   */
  focusFirst?: boolean;
}

export function MatrixCanvas({
  mode = 'light',
  density = 'comfortable',
  dir = 'ltr',
  focusFirst = false,
}: MatrixCanvasProps) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (focusFirst && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [focusFirst]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const previousMode = root.getAttribute('data-mode');
    const previousDir = root.getAttribute('dir');
    const previousDensity = root.getAttribute('data-density');
    root.setAttribute('data-mode', mode);
    root.setAttribute('dir', dir);
    root.setAttribute('data-density', density);
    return () => {
      if (previousMode !== null) root.setAttribute('data-mode', previousMode);
      else root.removeAttribute('data-mode');
      if (previousDir !== null) root.setAttribute('dir', previousDir);
      else root.removeAttribute('dir');
      if (previousDensity !== null) root.setAttribute('data-density', previousDensity);
      else root.removeAttribute('data-density');
    };
  }, [mode, dir, density]);

  return (
    <div
      data-testid="matrix-root"
      style={{
        width: 960,
        padding: 24,
        background: 'var(--surface-default-bg)',
        color: 'var(--text-primary)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h2 style={{ marginTop: 0 }}>Invariant Matrix</h2>
      <p style={{ color: 'var(--text-secondary)' }}>
        mode={mode} · density={density} · dir={dir}
      </p>

      <section style={{ marginTop: 24 }}>
        <h3>Buttons</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button ref={buttonRef} variant="primary">
            Primary
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Form Controls</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input placeholder="Enter text" defaultValue="Sample" />
          <Checkbox defaultChecked aria-label="Checkbox" />
          <Switch defaultChecked aria-label="Switch" />
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Surface</h3>
        <Card>
          <CardHeader>
            <h4 style={{ margin: 0 }}>Card title</h4>
            <Badge>Status</Badge>
          </CardHeader>
          <CardBody>
            <p style={{ margin: 0 }}>Card body content for surface invariant assertion.</p>
          </CardBody>
        </Card>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Type scale</h3>
        <h1 style={{ marginTop: 0 }}>Heading 1</h1>
        <h2>Heading 2</h2>
        <h3>Heading 3</h3>
        <p>
          Body text — the quick brown fox jumps over the lazy dog. The quick brown fox jumps over
          the lazy dog.
        </p>
      </section>
    </div>
  );
}

MatrixCanvas.displayName = 'MatrixCanvas';
