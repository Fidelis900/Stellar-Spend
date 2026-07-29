'use client';

import { useState, useEffect, useRef } from 'react';
import { BeneficiaryStorage, SavedBeneficiary } from '@/lib/beneficiary-storage';
import { cn } from '@/lib/cn';

// Extended type stored in localStorage alongside SavedBeneficiary
interface BeneficiaryMeta {
  id: string;
  usageCount: number;
  verificationStatus: 'unverified' | 'pending' | 'verified';
  group: string;
}

const META_KEY = 'stellar_spend_beneficiary_meta';

function getMeta(): Record<string, BeneficiaryMeta> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveMeta(meta: Record<string, BeneficiaryMeta>) {
  if (typeof window !== 'undefined') localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function getOrCreateMeta(id: string): BeneficiaryMeta {
  const all = getMeta();
  if (!all[id]) {
    all[id] = { id, usageCount: 0, verificationStatus: 'unverified', group: 'Default' };
    saveMeta(all);
  }
  return all[id];
}

function updateMeta(id: string, updates: Partial<BeneficiaryMeta>) {
  const all = getMeta();
  all[id] = { ...getOrCreateMeta(id), ...updates };
  saveMeta(all);
}

function incrementUsage(id: string) {
  const meta = getOrCreateMeta(id);
  updateMeta(id, { usageCount: meta.usageCount + 1 });
}

const CURRENCIES = ['NGN', 'KES', 'GHS'];
const GROUPS = ['Default', 'Family', 'Business', 'Friends'];

const verificationBadge = (status: BeneficiaryMeta['verificationStatus']) => {
  if (status === 'verified') return { label: 'Verified', cls: 'text-green-400 border-green-400' };
  if (status === 'pending') return { label: 'Pending', cls: 'text-yellow-400 border-yellow-400' };
  return { label: 'Unverified', cls: 'text-[#555555] border-[#333333]' };
};

type View = 'list' | 'add' | 'edit';

const emptyForm = { name: '', accountNumber: '', bankCode: '', currency: 'NGN', group: 'Default' };

export function BeneficiaryManager() {
  const [beneficiaries, setBeneficiaries] = useState<SavedBeneficiary[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, BeneficiaryMeta>>({});
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [filterGroup, setFilterGroup] = useState<string>('All');
  const [nameSuggestions, setNameSuggestions] = useState<SavedBeneficiary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const reload = () => {
    const all = BeneficiaryStorage.getAllBeneficiaries();
    setBeneficiaries(all);
    const meta = getMeta();
    // Ensure meta exists for all beneficiaries
    all.forEach((b) => {
      if (!meta[b.id])
        meta[b.id] = {
          id: b.id,
          usageCount: 0,
          verificationStatus: 'unverified',
          group: 'Default',
        };
    });
    saveMeta(meta);
    setMetaMap({ ...meta });
  };

  useEffect(() => {
    reload();
  }, []);

  const handleSave = () => {
    if (!formData.name || !formData.accountNumber || !formData.bankCode) return;
    if (editingId) {
      BeneficiaryStorage.updateBeneficiary(editingId, {
        name: formData.name,
        accountNumber: formData.accountNumber,
        bankCode: formData.bankCode,
        currency: formData.currency,
      });
      updateMeta(editingId, { group: formData.group });
    } else {
      const saved = BeneficiaryStorage.saveBeneficiary({
        name: formData.name,
        accountNumber: formData.accountNumber,
        bankCode: formData.bankCode,
        currency: formData.currency,
      });
      updateMeta(saved.id, { group: formData.group });
    }
    reload();
    setFormData(emptyForm);
    setEditingId(null);
    setView('list');
  };

  const handleEdit = (b: SavedBeneficiary) => {
    const meta = getOrCreateMeta(b.id);
    setFormData({
      name: b.name,
      accountNumber: b.accountNumber || '',
      bankCode: b.bankCode || '',
      currency: b.currency,
      group: meta.group,
    });
    setEditingId(b.id);
    setView('edit');
  };

  const handleDelete = (id: string) => {
    BeneficiaryStorage.deleteBeneficiary(id);
    reload();
  };

  const handleVerify = (id: string) => {
    updateMeta(id, { verificationStatus: 'pending' });
    // Simulate async verification
    setTimeout(() => {
      updateMeta(id, { verificationStatus: 'verified' });
      setMetaMap({ ...getMeta() });
    }, 1500);
    setMetaMap({ ...getMeta() });
  };

  const handleUse = (id: string) => {
    incrementUsage(id);
    setMetaMap({ ...getMeta() });
  };

  const handleNameInput = (value: string) => {
    setFormData((f) => ({ ...f, name: value }));
    if (value.trim().length < 1) {
      setNameSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const query = value.toLowerCase();
    const matches = beneficiaries.filter(
      (b) => b.id !== editingId && b.name.toLowerCase().includes(query),
    );
    setNameSuggestions(matches.slice(0, 5));
    setShowSuggestions(matches.length > 0);
  };

  const applySuggestion = (b: SavedBeneficiary) => {
    const meta = getOrCreateMeta(b.id);
    // Try to decrypt sensitive fields; fall back to empty strings if unavailable.
    let accountNumber = '';
    let bankCode = '';
    try {
      const decrypted = BeneficiaryStorage.decryptBeneficiary(b);
      accountNumber = decrypted.accountNumber;
      bankCode = decrypted.bankCode;
    } catch {
      // Decryption unavailable in this environment — user fills fields manually.
    }
    setFormData({
      name: b.name,
      accountNumber,
      bankCode,
      currency: b.currency,
      group: meta.group,
    });
    setShowSuggestions(false);
    setNameSuggestions([]);
  };

  const allGroups = ['All', ...GROUPS];
  const filtered =
    filterGroup === 'All'
      ? beneficiaries
      : beneficiaries.filter((b) => (metaMap[b.id]?.group ?? 'Default') === filterGroup);

  const groupCounts = GROUPS.reduce<Record<string, number>>((acc, g) => {
    acc[g] = beneficiaries.filter((b) => (metaMap[b.id]?.group ?? 'Default') === g).length;
    return acc;
  }, {});

  return (
    <div className="border border-[#333333] bg-[#111111] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white tracking-wider uppercase">Beneficiaries</h2>
        {view === 'list' && (
          <button
            onClick={() => {
              setFormData(emptyForm);
              setEditingId(null);
              setView('add');
            }}
            className="text-[10px] uppercase tracking-widest px-3 py-1.5 border border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a] transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {/* List View */}
      {view === 'list' && (
        <>
          {/* Group filter */}
          <div className="flex flex-wrap gap-2">
            {allGroups.map((g) => (
              <button
                key={g}
                onClick={() => setFilterGroup(g)}
                className={cn(
                  'text-[10px] uppercase tracking-widest px-3 py-1 border transition-colors',
                  filterGroup === g
                    ? 'border-[#c9a962] text-[#c9a962]'
                    : 'border-[#333333] text-[#555555] hover:text-[#777777]',
                )}
              >
                {g}
                {g !== 'All' && groupCounts[g] > 0 ? ` (${groupCounts[g]})` : ''}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-xs text-[#555555] text-center py-4">No beneficiaries found</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((b) => {
                const meta = metaMap[b.id] ?? {
                  usageCount: 0,
                  verificationStatus: 'unverified',
                  group: 'Default',
                };
                const badge = verificationBadge(meta.verificationStatus);
                return (
                  <div key={b.id} className="border border-[#222222] p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-white font-semibold">{b.name}</span>
                          <span
                            className={cn(
                              'text-[9px] uppercase tracking-widest border px-1.5 py-0.5',
                              badge.cls,
                            )}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[9px] text-[#555555] border border-[#222222] px-1.5 py-0.5">
                            {meta.group}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#777777] mt-0.5">{b.currency}</div>
                        <div className="text-[10px] text-[#555555] mt-0.5">
                          Used {meta.usageCount} time{meta.usageCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {meta.verificationStatus === 'unverified' && (
                          <button
                            onClick={() => handleVerify(b.id)}
                            className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[#333333] text-[#777777] hover:border-yellow-400 hover:text-yellow-400 transition-colors"
                          >
                            Verify
                          </button>
                        )}
                        <button
                          onClick={() => handleUse(b.id)}
                          className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[#333333] text-[#777777] hover:border-[#c9a962] hover:text-[#c9a962] transition-colors"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => handleEdit(b)}
                          className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[#333333] text-[#777777] hover:border-[#c9a962] hover:text-[#c9a962] transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[#333333] text-[#777777] hover:border-red-400 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add / Edit Form */}
      {(view === 'add' || view === 'edit') && (
        <div className="space-y-3">
          <div className="text-[10px] text-[#777777] uppercase tracking-widest">
            {view === 'edit' ? 'Edit Beneficiary' : 'New Beneficiary'}
          </div>
          {/* Name field with typeahead suggestions */}
          <div className="relative" ref={suggestionsRef}>
            <input
              type="text"
              placeholder="Full Name"
              aria-label="Name"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              value={formData.name}
              onChange={(e) => handleNameInput(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
            />
            {showSuggestions && (
              <ul
                role="listbox"
                aria-label="Saved beneficiaries"
                className="absolute z-10 w-full border border-[#333333] bg-[#0d0d0d] mt-0.5 max-h-40 overflow-y-auto"
              >
                {nameSuggestions.map((b) => (
                  <li key={b.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={() => applySuggestion(b)}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-[#1a1a1a] focus:bg-[#1a1a1a] focus:outline-none"
                    >
                      <span className="text-white">{b.name}</span>
                      <span className="ml-2 text-[#555555]">{b.currency}</span>
                      <span className="ml-2 text-[#444444]">••••</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {[
            { key: 'accountNumber', placeholder: 'Account Number', label: 'Account Number' },
            { key: 'bankCode', placeholder: 'Bank Code', label: 'Bank Code' },
          ].map(({ key, placeholder, label }) => (
            <input
              key={key}
              type="text"
              placeholder={placeholder}
              aria-label={label}
              value={formData[key as keyof typeof formData]}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
            />
          ))}
          <select
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            aria-label="Currency"
            className="w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={formData.group}
            onChange={(e) => setFormData({ ...formData, group: e.target.value })}
            aria-label="Group"
            className="w-full bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!formData.name || !formData.accountNumber || !formData.bankCode}
              className={cn(
                'flex-1 text-[10px] uppercase tracking-widest px-4 py-2 border transition-colors',
                formData.name && formData.accountNumber && formData.bankCode
                  ? 'border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a]'
                  : 'border-[#333333] text-[#444444] cursor-not-allowed',
              )}
            >
              {view === 'edit' ? 'Update' : 'Save'}
            </button>
            <button
              onClick={() => {
                setView('list');
                setEditingId(null);
                setFormData(emptyForm);
              }}
              className="flex-1 text-[10px] uppercase tracking-widest px-4 py-2 border border-[#333333] text-[#777777] hover:border-[#555555] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
