'use client';

import { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Button, Card, Badge, Alert } from '@/components/design-system';
import { DataTable, type DataTableColumn } from '@/components/DataTable';

interface BatchBeneficiary {
  id: string;
  name: string;
  accountNumber: string;
  institution: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

interface BatchUIProps {
  onSubmitBatch: (beneficiaries: BatchBeneficiary[]) => Promise<void>;
  isLoading?: boolean;
}

export function BatchUI({ onSubmitBatch, isLoading = false }: BatchUIProps) {
  const [beneficiaries, setBeneficiaries] = useState<BatchBeneficiary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = beneficiaries.reduce((sum, b) => sum + b.amount, 0);
    const count = beneficiaries.length;
    const estimatedFee = count * 0.5; // Dummy fee calculation
    return { total, count, estimatedFee };
  }, [beneficiaries]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);

        const parsed: BatchBeneficiary[] = rows.map((row, index) => ({
          id: `batch-${Date.now()}-${index}`,
          name: row.Name || row.name || 'Unknown',
          accountNumber: row.Account || row.account || '',
          institution: row.Institution || row.institution || '',
          amount: parseFloat(row.Amount || row.amount || '0'),
          currency: row.Currency || row.currency || 'NGN',
          status: 'pending',
        }));

        // Basic validation
        const invalidRows = parsed.filter(p => !p.accountNumber || p.amount <= 0);
        if (invalidRows.length > 0) {
          setError(`Found ${invalidRows.length} invalid rows. Please check amount and account numbers.`);
        }

        setBeneficiaries(parsed);
        setSuccess(`Successfully imported ${parsed.length} beneficiaries.`);
      } catch (err) {
        setError('Failed to parse file. Please ensure it is a valid CSV or Excel file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const removeBeneficiary = (id: string) => {
    setBeneficiaries(prev => prev.filter(b => b.id !== id));
  };

  const handleSubmit = async () => {
    if (beneficiaries.length === 0) return;
    setError(null);
    setSuccess(null);
    
    try {
      await onSubmitBatch(beneficiaries);
      setSuccess('Batch submitted successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to submit batch');
    }
  };

  const downloadTemplate = () => {
    const template = [
      { Name: 'John Doe', Account: '1234567890', Institution: 'First Bank', Amount: 5000, Currency: 'NGN' },
      { Name: 'Jane Smith', Account: '0987654321', Institution: 'GTBank', Amount: 25.50, Currency: 'USD' },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'stellar_spend_batch_template.csv');
  };

  const batchColumns: DataTableColumn<BatchBeneficiary>[] = [
    { key: 'name', header: 'Beneficiary', sortValue: (b) => b.name, accessor: (b) => <span className="font-medium">{b.name}</span> },
    { key: 'accountNumber', header: 'Account', accessor: (b) => <span className="font-mono">{b.accountNumber}</span> },
    { key: 'institution', header: 'Institution', sortValue: (b) => b.institution, accessor: (b) => b.institution },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (b) => b.amount,
      accessor: (b) => (
        <span className="font-semibold">
          {b.amount.toLocaleString()} {b.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      sortValue: (b) => b.status,
      accessor: (b) => (
        <Badge variant={b.status === 'success' ? 'success' : b.status === 'failed' ? 'error' : 'default'}>
          {b.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      accessor: (b) => (
        <button
          onClick={() => removeBeneficiary(b.id)}
          aria-label={`Remove ${b.name}`}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          ✕
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h3 className="text-xl font-bold">Batch Payouts</h3>
            <p className="text-sm text-gray-500">Upload a CSV or Excel file to send to multiple beneficiaries at once.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={downloadTemplate}>
              Download Template
            </Button>
            <label className="cursor-pointer">
              <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">
                Upload File
              </span>
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}
        {success && <Alert variant="success" className="mb-4">{success}</Alert>}

        {beneficiaries.length > 0 ? (
          <div className="space-y-4">
            <DataTable
              variant="light"
              columns={batchColumns}
              rows={beneficiaries}
              getRowKey={(b) => b.id}
              caption="Batch payout beneficiaries"
              pageSize={10}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Total Recipients</p>
                <p className="text-lg font-bold">{stats.count}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Total Volume (Approx)</p>
                <p className="text-lg font-bold">{stats.total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-bold">Estimated Fees</p>
                <p className="text-lg font-bold text-blue-600">{stats.estimatedFee.toFixed(2)} USDC</p>
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleSubmit} 
              isLoading={isLoading}
              disabled={beneficiaries.length === 0 || !!error}
            >
              Confirm and Submit Batch
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-gray-500 mb-2">No beneficiaries imported yet.</p>
            <p className="text-xs text-gray-400">Supported formats: .csv, .xlsx</p>
          </div>
        )}
      </Card>
    </div>
  );
}
