import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardContent, CardFooter } from './Card';
import React from 'react';

const meta: Meta<typeof Card> = {
  title: 'Design System/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'elevated', 'outlined'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    variant: 'default',
    children: 'This is a default card.',
  },
};

export const Elevated: Story = {
  args: {
    variant: 'elevated',
    children: 'This is an elevated card with shadow.',
  },
};

export const Outlined: Story = {
  args: {
    variant: 'outlined',
    children: 'This is an outlined card.',
  },
};

export const WithHeaderAndFooter: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <h2 className="text-xl font-bold">Card Title</h2>
      </CardHeader>
      <CardContent>
        <p>This is the main content of the card. It can contain any elements.</p>
      </CardContent>
      <CardFooter>
        <div className="flex justify-end gap-2">
          <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            Submit
          </button>
        </div>
      </CardFooter>
    </Card>
  ),
};
