import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'UI Primitives/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'error'],
    },
    inputSize: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    placeholder: 'Enter a value',
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    defaultValue: 'invalid@',
    placeholder: 'Enter your email',
  },
};

export const Small: Story = {
  args: {
    inputSize: 'sm',
    placeholder: 'Small',
  },
};

export const Large: Story = {
  args: {
    inputSize: 'lg',
    placeholder: 'Large',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    defaultValue: 'Cannot edit this',
  },
};
