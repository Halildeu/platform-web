import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { HoverDescription } from './HoverDescription';

const meta: Meta<typeof HoverDescription> = {
  title: 'Primitives/HoverDescription',
  component: HoverDescription,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    description: { control: 'text', description: 'Tooltip body text' },
    title: { control: 'text', description: 'Optional bold title' },
    width: {
      control: { type: 'number', min: 200, max: 600 },
      description: 'Tooltip card width in px',
    },
    delay: {
      control: { type: 'number', min: 0, max: 1000 },
      description: 'Hover delay in ms before tooltip appears',
    },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 80 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof HoverDescription>;

export const Default: Story = {
  render: () => (
    <HoverDescription description="Bu alan toplam geliri ifade eder.">
      <span style={{ textDecoration: 'underline', cursor: 'help' }}>Toplam Gelir</span>
    </HoverDescription>
  ),
};

export const WithTitle: Story = {
  render: () => (
    <HoverDescription
      title="Gelir Detayı"
      description="Bu alan, tüm satış kanallarından elde edilen toplam geliri gösterir. KDV dahil tutardır."
      width={420}
    >
      <span style={{ textDecoration: 'underline', cursor: 'help' }}>Detayları gör</span>
    </HoverDescription>
  ),
};

export const WithDelay: Story = {
  render: () => (
    <HoverDescription description="500ms gecikme ile görünür." delay={500}>
      <span style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}>
        Gecikmeli tooltip
      </span>
    </HoverDescription>
  ),
};

export const NarrowCard: Story = {
  render: () => (
    <HoverDescription title="Kompakt" description="Dar tooltip kart genişliği." width={240}>
      <span style={{ textDecoration: 'underline' }}>240px</span>
    </HoverDescription>
  ),
};

export const LongText: Story = {
  render: () => (
    <HoverDescription
      title="Uzun açıklama"
      description={
        'Çok uzun bir açıklama metnidir. Tooltip kartı içinde satır kaydırma yapması beklenir. ' +
        'Detayları okumak için kullanıcı imleci tutar. Genişlik tooltip kartının okunabilirliğini etkiler.'
      }
      width={480}
    >
      <span style={{ textDecoration: 'underline' }}>Uzun metin</span>
    </HoverDescription>
  ),
};

export const Interactive: Story = {
  render: () => (
    <HoverDescription description="Hover testinde görünmesi beklenen tooltip metni.">
      <span data-testid="hover-trigger" style={{ textDecoration: 'underline', cursor: 'help' }}>
        Hover edin
      </span>
    </HoverDescription>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByTestId('hover-trigger');
    await expect(trigger).toBeInTheDocument();
    await userEvent.hover(trigger);
    // Tooltip rendered via portal — search the whole document
    const tip = await within(document.body).findByText(/Hover testinde görünmesi/);
    await expect(tip).toBeInTheDocument();
  },
};
