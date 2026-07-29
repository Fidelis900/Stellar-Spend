import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { DataTable, type DataTableColumn } from '@/components/DataTable';

interface Row {
  id: string;
  name: string;
  score: number;
}

const rows: Row[] = [
  { id: '1', name: 'Charlie', score: 30 },
  { id: '2', name: 'Alice', score: 10 },
  { id: '3', name: 'Bob', score: 20 },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortValue: (r) => r.name, accessor: (r) => r.name },
  {
    key: 'score',
    header: 'Score',
    align: 'right',
    sortValue: (r) => r.score,
    accessor: (r) => r.score,
  },
];

function getTable() {
  return screen.getByRole('table', { name: /test rows/i });
}

describe('DataTable', () => {
  it('renders all rows and column headers', () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} caption="Test rows" />);
    const table = getTable();
    expect(within(table).getByText('Name')).toBeInTheDocument();
    expect(within(table).getByText('Score')).toBeInTheDocument();
    expect(within(table).getByText('Charlie')).toBeInTheDocument();
    expect(within(table).getByText('Alice')).toBeInTheDocument();
    expect(within(table).getByText('Bob')).toBeInTheDocument();
  });

  it('renders the empty state when there are no rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        caption="Test rows"
        emptyState={<p>Nothing here</p>}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders the loading state instead of the table', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption="Test rows"
        isLoading
        loadingState={<p>Loading…</p>}
      />,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sorts rows ascending then descending on header activation, and is keyboard operable', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} caption="Test rows" />);

    const nameHeaderButton = screen.getByRole('button', { name: /name/i });
    nameHeaderButton.focus();
    await user.keyboard('{Enter}');

    let dataRows = within(getTable()).getAllByRole('row').slice(1);
    expect(within(dataRows[0]).getByText('Alice')).toBeInTheDocument();
    expect(within(dataRows[2]).getByText('Charlie')).toBeInTheDocument();

    await user.click(nameHeaderButton);
    dataRows = within(getTable()).getAllByRole('row').slice(1);
    expect(within(dataRows[0]).getByText('Charlie')).toBeInTheDocument();
  });

  it('exposes aria-sort on the active sorted column', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} caption="Test rows" />);

    const nameHeader = screen.getByRole('columnheader', { name: /name/i });
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /name/i }));
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('paginates rows when pageSize is set', async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption="Test rows"
        pageSize={2}
      />,
    );

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(within(getTable()).getAllByRole('row')).toHaveLength(3); // header + 2 rows

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(within(getTable()).getAllByRole('row')).toHaveLength(2); // header + 1 row
  });

  it('toggles column visibility via the Columns menu', async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption="Test rows"
        enableColumnVisibility
      />,
    );

    expect(within(getTable()).getByText('Score')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /columns/i }));
    await user.click(screen.getByRole('checkbox', { name: /score/i }));

    expect(within(getTable()).queryByText('Score')).not.toBeInTheDocument();
  });

  it('switches to virtualized rendering above the threshold without crashing', () => {
    const manyRows: Row[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      score: i,
    }));

    render(
      <DataTable
        columns={columns}
        rows={manyRows}
        getRowKey={(r) => r.id}
        caption="Test rows"
        virtualizeThreshold={5}
        rowHeight={32}
      />,
    );

    expect(screen.getByRole('table', { name: /test rows/i })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByRole('row').length).toBeGreaterThan(0);
  });

  it('matches the snapshot for a basic render', () => {
    const { asFragment } = render(
      <DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} caption="Test rows" />,
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
