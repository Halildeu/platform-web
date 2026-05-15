import figma from '@figma/code-connect';
import { ThemeLayout } from './ThemeLayout';

figma.connect(ThemeLayout, 'FIGMA_URL_PLACEHOLDER', {
  props: {
    theme: figma.enum('Theme', {
      executive: 'executive',
      operations: 'operations',
      analytics: 'analytics',
      compact: 'compact',
    }),
    accessReason: figma.string('AccessReason'),
  },
  example: ({ theme, accessReason }) => (
    <ThemeLayout theme={theme} slots={{}} accessReason={accessReason} />
  ),
});
