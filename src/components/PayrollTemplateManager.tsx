"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { PayrollTemplateStorage } from "@/lib/payroll/storage";
import type { PayrollTemplate, PayrollRecipient } from "@/lib/payroll/types";
import type { RecurringFrequency } from "@/lib/recurring-transactions";

interface Props {
  userAddress: string;
}

export default function PayrollTemplateManager({ userAddress }: Props) {
  const [templates, setTemplates] = useState<PayrollTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<PayrollTemplate | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    currency: "USD",
    cadence: "monthly" as RecurringFrequency,
  });
  const [recipients, setRecipients] = useState<Omit<PayrollRecipient, "id">[]>(
    [],
  );

  useEffect(() => {
    loadTemplates();
  }, [userAddress]);

  const loadTemplates = () => {
    setTemplates(PayrollTemplateStorage.getByUser(userAddress));
  };

  const handleCreate = () => {
    if (!form.name || recipients.length === 0) return;

    const totalAmount = recipients
      .reduce((sum, r) => sum + parseFloat(r.amount || "0"), 0)
      .toFixed(2);

    const template: PayrollTemplate = {
      id: PayrollTemplateStorage.generateId(),
      userAddress,
      name: form.name,
      description: form.description,
      currency: form.currency,
      cadence: form.cadence,
      recipients: recipients.map((r, i) => ({
        ...r,
        id: `recipient_${i}_${Date.now()}`,
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      paused: false,
      totalAmount,
    };

    PayrollTemplateStorage.save(template);
    loadTemplates();
    resetForm();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setForm({ name: "", description: "", currency: "USD", cadence: "monthly" });
    setRecipients([]);
  };

  const addRecipient = () => {
    setRecipients([
      ...recipients,
      {
        institution: "",
        accountIdentifier: "",
        accountName: "",
        currency: form.currency,
        amount: "",
      },
    ]);
  };

  const updateRecipient = (index: number, field: string, value: string) => {
    const updated = [...recipients];
    updated[index] = { ...updated[index], [field]: value };
    setRecipients(updated);
  };

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const togglePause = (template: PayrollTemplate) => {
    PayrollTemplateStorage.update(template.id, { paused: !template.paused });
    loadTemplates();
  };

  const deleteTemplate = (id: string) => {
    if (confirm("Delete this payroll template?")) {
      PayrollTemplateStorage.delete(id);
      loadTemplates();
    }
  };

  return (
    <div className="border border-[#333] bg-[#111] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white tracking-wider uppercase">
          Payroll Templates
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(
            "text-[10px] tracking-widest uppercase px-3 py-2 border",
            "border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a]",
          )}
        >
          {showForm ? "Cancel" : "+ New Template"}
        </button>
      </div>

      {showForm && (
        <div className="border border-[#333] p-4 space-y-4 bg-[#0a0a0a]">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#777] uppercase tracking-widest">
                Template Name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Monthly Payroll"
                className="bg-[#111] border border-[#333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#777] uppercase tracking-widest">
                Description
              </label>
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Optional description"
                className="bg-[#111] border border-[#333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#777] uppercase tracking-widest">
                Cadence
              </label>
              <select
                value={form.cadence}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cadence: e.target.value as RecurringFrequency,
                  })
                }
                className="bg-[#111] border border-[#333] px-3 py-2 text-xs text-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#777] uppercase tracking-widest">
                Currency
              </label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="bg-[#111] border border-[#333] px-3 py-2 text-xs text-white"
              >
                <option value="USD">USD</option>
                <option value="NGN">NGN</option>
                <option value="KES">KES</option>
                <option value="GHS">GHS</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[#777] uppercase tracking-widest">
                Recipients ({recipients.length})
              </label>
              <button
                onClick={addRecipient}
                className="text-[10px] tracking-widest uppercase px-2 py-1 border border-[#c9a962] text-[#c9a962]"
              >
                + Add Recipient
              </button>
            </div>

            {recipients.map((recipient, idx) => (
              <div key={idx} className="border border-[#444] p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={recipient.institution}
                    onChange={(e) =>
                      updateRecipient(idx, "institution", e.target.value)
                    }
                    placeholder="Institution"
                    className="bg-[#111] border border-[#333] px-2 py-1 text-xs text-white"
                  />
                  <input
                    value={recipient.accountIdentifier}
                    onChange={(e) =>
                      updateRecipient(idx, "accountIdentifier", e.target.value)
                    }
                    placeholder="Account #"
                    className="bg-[#111] border border-[#333] px-2 py-1 text-xs text-white"
                  />
                  <input
                    value={recipient.accountName}
                    onChange={(e) =>
                      updateRecipient(idx, "accountName", e.target.value)
                    }
                    placeholder="Account Name"
                    className="bg-[#111] border border-[#333] px-2 py-1 text-xs text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    value={recipient.amount}
                    onChange={(e) =>
                      updateRecipient(idx, "amount", e.target.value)
                    }
                    placeholder="Amount"
                    type="number"
                    className="flex-1 bg-[#111] border border-[#333] px-2 py-1 text-xs text-white"
                  />
                  <button
                    onClick={() => removeRecipient(idx)}
                    className="text-[10px] px-2 py-1 border border-red-500/30 text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleCreate}
            className="text-[10px] tracking-widest uppercase px-4 py-2 border border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a]"
          >
            Create Template
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <p className="text-xs text-[#555] text-center py-4">
          No payroll templates yet
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className={cn(
                "border p-3",
                t.paused ? "border-[#333] opacity-60" : "border-[#444]",
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="text-xs text-white font-medium">{t.name}</div>
                  {t.description && (
                    <div className="text-[10px] text-[#555]">
                      {t.description}
                    </div>
                  )}
                  <div className="text-[10px] text-[#777]">
                    {t.recipients.length} recipients · {t.totalAmount}{" "}
                    {t.currency} · {t.cadence}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => togglePause(t)}
                    className={cn(
                      "text-[10px] uppercase px-2 py-1 border",
                      t.paused
                        ? "border-green-500/50 text-green-400"
                        : "border-yellow-500/50 text-yellow-400",
                    )}
                  >
                    {t.paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="text-[10px] uppercase px-2 py-1 border border-red-500/30 text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
