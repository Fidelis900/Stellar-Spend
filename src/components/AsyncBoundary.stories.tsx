import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AsyncBoundary,
  ListLoadingState,
  ListEmptyState,
  ListErrorState,
} from './AsyncBoundary';

const meta = {
  title: 'Components/AsyncBoundary',
  component: AsyncBoundary,
  tags: ['autodocs'],
} satisfies Meta<typeof AsyncBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample content component
function SampleList() {
  return (
    <div className="border border-[#333333] bg-[#111111] rounded">
      <div className="px-4 py-3 border-b border-[#333333]">
        <h3 className="text-sm font-semibold text-white">Items</h3>
      </div>
      <ul className="divide-y divide-[#222222]">
        {[1, 2, 3].map((i) => (
          <li key={i} className="px-4 py-3 text-sm text-[#aaaaaa]">
            Item {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const Loaded: Story = {
  args: {
    isLoading: false,
    isEmpty: false,
    children: <SampleList />,
  },
};

export const LoadingState: Story = {
  args: {
    isLoading: true,
    isEmpty: false,
    loadingContent: <ListLoadingState rows={3} />,
    children: <SampleList />,
  },
};

export const EmptyState: Story = {
  args: {
    isLoading: false,
    isEmpty: true,
    emptyContent: (
      <ListEmptyState
        title="No transactions"
        description="Connect your wallet to view your transactions"
        action={
          <button className="px-4 py-2 bg-[#c9a962] text-[#0a0a0a] text-xs font-semibold rounded hover:bg-[#dbb76d] transition-colors">
            Connect Wallet
          </button>
        }
      />
    ),
    children: <SampleList />,
  },
};

export const ErrorState: Story = {
  args: {
    isLoading: false,
    isEmpty: false,
    error: 'Failed to fetch transactions. Please try again.',
    errorContent: (error) => (
      <ListErrorState
        error={error}
        onRetry={() => alert('Retrying...')}
      />
    ),
    children: <SampleList />,
  },
};

// LoadingState story
const LoadingMeta = {
  title: 'Components/ListLoadingState',
  component: ListLoadingState,
  tags: ['autodocs'],
} satisfies Meta<typeof ListLoadingState>;

export const LoadingStateMeta = {
  default: {
    args: {
      rows: 5,
    },
  } satisfies StoryObj<typeof ListLoadingState>,
};

// EmptyState story
const EmptyMeta = {
  title: 'Components/ListEmptyState',
  component: ListEmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof ListEmptyState>;

export const EmptyStateMeta = {
  default: {
    args: {
      title: 'No items found',
      description: 'Try adjusting your filters or create a new item',
    },
  } satisfies StoryObj<typeof ListEmptyState>,
  withAction: {
    args: {
      title: 'No notifications yet',
      description: 'You will see updates about your transactions here',
      action: (
        <button className="px-4 py-2 bg-[#c9a962] text-[#0a0a0a] text-xs font-semibold rounded">
          Enable Notifications
        </button>
      ),
    },
  } satisfies StoryObj<typeof ListEmptyState>,
};

// ErrorState story
const ErrorMeta = {
  title: 'Components/ListErrorState',
  component: ListErrorState,
  tags: ['autodocs'],
} satisfies Meta<typeof ListErrorState>;

export const ErrorStateMeta = {
  default: {
    args: {
      error: 'Failed to load data',
    },
  } satisfies StoryObj<typeof ListErrorState>,
  withRetry: {
    args: {
      error: 'Connection timeout. Please check your internet and try again.',
      onRetry: () => alert('Retrying...'),
    },
  } satisfies StoryObj<typeof ListErrorState>,
};
