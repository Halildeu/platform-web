// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Image } from '../Image';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class MockIO {
      private cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
      }
      observe() {
        this.cb(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

describe('Image — temel render', () => {
  it('img element render eder', () => {
    render(<Image src="/test.jpg" alt="Test" />);
    expect(screen.getByRole('img', { name: 'Test' })).toBeInTheDocument();
  });

  it('data-component attribute ekler', () => {
    const { container } = render(<Image src="/test.jpg" alt="Test" />);
    expect(container.querySelector('[data-component="image"]')).toBeInTheDocument();
  });

  it('objectFit class uygular', () => {
    render(<Image src="/test.jpg" alt="Cover" objectFit="contain" />);
    const img = screen.getByRole('img', { name: 'Cover' });
    expect(img.className).toContain('object-contain');
  });

  it('rounded class uygular', () => {
    const { container } = render(<Image src="/test.jpg" alt="R" rounded="full" />);
    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
  });
});

describe('Image.Group', () => {
  it('grup container render eder', () => {
    const { container } = render(
      <Image.Group>
        <Image src="/1.jpg" alt="1" />
        <Image src="/2.jpg" alt="2" />
      </Image.Group>,
    );
    expect(container.querySelector('[data-component="image-group"]')).toBeInTheDocument();
  });
});

describe('Image — accessibility', () => {
  it('has no a11y violations (with alt text)', async () => {
    const { container } = render(
      <Image src="https://example.com/photo.jpg" alt="A descriptive label" lazy={false} />,
    );
    await expectNoA11yViolations(container);
  });

  it('has no a11y violations (decorative — empty alt)', async () => {
    // Decorative images use alt="" so screen readers skip them.
    const { container } = render(
      <Image src="https://example.com/decorative.jpg" alt="" lazy={false} />,
    );
    await expectNoA11yViolations(container);
  });
});
