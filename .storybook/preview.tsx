import type { Preview } from '@storybook/nextjs-vite';
import '../src/app/globals.css';
import React from 'react';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
    backgrounds: {
      disable: true,
    },
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'dark',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'circlehollow', title: 'Light' },
          { value: 'dark', icon: 'circle', title: 'Dark' },
          { value: 'high-contrast', icon: 'eye', title: 'High Contrast' },
        ],
        showName: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || 'dark';
      React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
      }, [theme]);
      return (
        <div className="bg-[var(--bg)] text-[var(--text)] min-h-screen p-8">
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
