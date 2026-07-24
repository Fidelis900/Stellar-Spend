import { logger } from '@/lib/logger';
"use client";

import { useState, useEffect, useCallback } from "react";
import { PriceAlert, AlertStatus } from "@/lib/price-alerts";
import { Button, Card } from "@/components/design-system";
import { useStellarWallet } from "@/hooks/useStellarWallet";
import { useToast } from "@/contexts/ToastContext";

interface PriceAlertManagerProps {
  onAlertTriggered?: (alerts: PriceAlert[]) => void;
}

const SNOOZE_DURATION = 30 * 60 * 1000; // 30 minutes

function sendBrowserNotification(alert: PriceAlert) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Stellar-Spend Price Alert", {
      body: `${alert.currency} rate is now ${alert.alertType} ${alert.targetPrice}`,
      icon: "/icons/icon-192x192.png",
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") sendBrowserNotification(alert);
    });
  }
}

export function PriceAlertManager({
  onAlertTriggered,
}: PriceAlertManagerProps) {
  const { wallet, isConnected } = useStellarWallet();
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAlert, setEditingAlert] = useState<PriceAlert | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    currency: "NGN",
    targetPrice: "",
    alertType: "above" as "above" | "below",
    recurring: false,
  });

  const fetchAlerts = useCallback(async () => {
    if (!wallet?.publicKey) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/offramp/price-alerts?userAddress=${wallet.publicKey}`,
      );
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      logger.error("Failed to fetch alerts:", {}, error);
      showToast("Failed to load price alerts", "error");
    } finally {
      setIsLoading(false);
    }
  }, [wallet?.publicKey, showToast]);

  useEffect(() => {
    if (isConnected) {
      fetchAlerts();
    } else {
      setAlerts([]);
    }
  }, [isConnected, fetchAlerts]);

  // Polling for price changes and alert evaluation
  useEffect(() => {
    if (!isConnected || !wallet?.publicKey) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/offramp/rate");
        const data = await res.json();
        const currentRate = data.rate;
        const currentCurrency = data.currency;

        // Simple client-side check for immediate notification
        // In a real app, the server would handle this via push notifications
        alerts.forEach((alert) => {
          if (alert.status !== "active" || alert.currency !== currentCurrency)
            return;

          const isTriggered =
            (alert.alertType === "above" && currentRate >= alert.targetPrice) ||
            (alert.alertType === "below" && currentRate <= alert.targetPrice);

          if (isTriggered) {
            const snoozeExpiry = snoozedUntil[alert.id];
            if (!snoozeExpiry || Date.now() > snoozeExpiry) {
              sendBrowserNotification(alert);
              onAlertTriggered?.([alert]);
              // Refresh to get updated triggered status from server
              fetchAlerts();
            }
          }
        });
      } catch (error) {
        logger.error("Price check failed:", {}, error);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [
    isConnected,
    wallet?.publicKey,
    alerts,
    snoozedUntil,
    onAlertTriggered,
    fetchAlerts,
  ]);

  const handleCreateOrUpdate = async () => {
    if (!formData.targetPrice || !wallet?.publicKey) return;

    const payload = {
      ...formData,
      targetPrice: parseFloat(formData.targetPrice),
      userAddress: wallet.publicKey,
    };

    try {
      const url = editingAlert
        ? `/api/offramp/price-alerts/${editingAlert.id}`
        : "/api/offramp/price-alerts";

      const res = await fetch(url, {
        method: editingAlert ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(
          `Alert ${editingAlert ? "updated" : "created"} successfully`,
          "success",
        );
        fetchAlerts();
        setFormData({
          currency: "NGN",
          targetPrice: "",
          alertType: "above",
          recurring: false,
        });
        setShowForm(false);
        setEditingAlert(null);
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save alert", "error");
      }
    } catch (error) {
      showToast("An error occurred while saving the alert", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/offramp/price-alerts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("Alert deleted", "success");
        fetchAlerts();
      }
    } catch (error) {
      showToast("Failed to delete alert", "error");
    }
  };

  const handleToggle = async (alert: PriceAlert) => {
    const nextStatus: AlertStatus =
      alert.status === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`/api/offramp/price-alerts/${alert.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchAlerts();
      }
    } catch (error) {
      showToast("Failed to update alert", "error");
    }
  };

  const handleEdit = (alert: PriceAlert) => {
    setEditingAlert(alert);
    setFormData({
      currency: alert.currency,
      targetPrice: alert.targetPrice.toString(),
      alertType: alert.alertType,
      recurring: alert.recurring,
    });
    setShowForm(true);
  };

  const handleSnooze = (id: string) => {
    const until = Date.now() + SNOOZE_DURATION;
    setSnoozedUntil((prev) => ({ ...prev, [id]: until }));
    showToast("Alert snoozed for 30 minutes", "info");
  };

  const activeAlerts = alerts.filter((a) => a.status !== "triggered");
  const history = alerts.filter((a) => a.status === "triggered");
  const triggeredCount = history.length;

  if (!isConnected) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-2">Price Alerts</h3>
        <p className="text-sm text-gray-500">
          Connect your wallet to manage price alerts.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Price Alerts</h3>
        {triggeredCount > 0 && (
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
            {triggeredCount} triggered
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b">
        {(["active", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-1 text-sm capitalize ${activeTab === tab ? "border-b-2 border-blue-600 font-medium" : "text-gray-500"}`}
          >
            {tab}{" "}
            {tab === "history" && triggeredCount > 0
              ? `(${triggeredCount})`
              : ""}
          </button>
        ))}
      </div>

      {activeTab === "active" && (
        <>
          <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
            {isLoading && (
              <p className="text-sm text-gray-500">Loading alerts...</p>
            )}
            {!isLoading && activeAlerts.length === 0 && (
              <p className="text-sm text-gray-500">No active alerts.</p>
            )}
            {activeAlerts.map((alert) => {
              const isSnoozed =
                snoozedUntil[alert.id] && Date.now() < snoozedUntil[alert.id];
              return (
                <div
                  key={alert.id}
                  className="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-800 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {alert.currency} {alert.alertType === "above" ? "≥" : "≤"}{" "}
                      {alert.targetPrice.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-500">
                        {isSnoozed ? (
                          `Snoozed until ${new Date(snoozedUntil[alert.id]).toLocaleTimeString()}`
                        ) : (
                          <span
                            className={
                              alert.status === "active"
                                ? "text-green-600"
                                : "text-gray-400"
                            }
                          >
                            {alert.status}
                          </span>
                        )}
                      </p>
                      {alert.recurring && (
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded">
                          Recurring
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      onClick={() => handleToggle(alert)}
                      variant="secondary"
                      size="sm"
                    >
                      {alert.status === "active" ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      onClick={() => handleEdit(alert)}
                      variant="secondary"
                      size="sm"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleSnooze(alert.id)}
                      variant="secondary"
                      size="sm"
                      title="Snooze 30 min"
                    >
                      💤
                    </Button>
                    <button
                      onClick={() => handleDelete(alert.id)}
                      className="text-red-500 hover:text-red-700 px-1 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {showForm ? (
            <div className="space-y-2 border-t pt-4">
              <h4 className="text-sm font-medium">
                {editingAlert ? "Edit Alert" : "New Alert"}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={formData.currency}
                  onChange={(e) =>
                    setFormData({ ...formData, currency: e.target.value })
                  }
                  className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-900"
                >
                  <option value="NGN">NGN (Nigeria)</option>
                  <option value="KES">KES (Kenya)</option>
                  <option value="GHS">GHS (Ghana)</option>
                  <option value="ZAR">ZAR (South Africa)</option>
                </select>
                <select
                  value={formData.alertType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      alertType: e.target.value as "above" | "below",
                    })
                  }
                  className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-900"
                >
                  <option value="above">Rate goes above</option>
                  <option value="below">Rate goes below</option>
                </select>
              </div>
              <input
                type="number"
                placeholder="Target Rate"
                value={formData.targetPrice}
                onChange={(e) =>
                  setFormData({ ...formData, targetPrice: e.target.value })
                }
                className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-900"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.recurring}
                  onChange={(e) =>
                    setFormData({ ...formData, recurring: e.target.checked })
                  }
                />
                Recurring alert (don't disable after trigger)
              </label>
              <div className="flex gap-2">
                <Button onClick={handleCreateOrUpdate}>
                  {editingAlert ? "Update" : "Create"}
                </Button>
                <Button
                  onClick={() => {
                    setShowForm(false);
                    setEditingAlert(null);
                  }}
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowForm(true)}>+ New Alert</Button>
          )}
        </>
      )}

      {activeTab === "history" && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {history.length === 0 && (
            <p className="text-sm text-gray-500">No triggered alerts yet.</p>
          )}
          {history.map((alert) => (
            <div
              key={alert.id}
              className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-100 dark:border-amber-900/40"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {alert.currency} {alert.alertType === "above" ? "≥" : "≤"}{" "}
                    {alert.targetPrice.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    Triggered{" "}
                    {alert.triggeredAt
                      ? new Date(alert.triggeredAt).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(alert.id)}
                  className="text-red-500 hover:text-red-700 px-1 text-sm"
                >
                  ✕
                </button>
              </div>
              {alert.triggerHistory && alert.triggerHistory.length > 0 && (
                <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                  <p className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase">
                    Recent Activity
                  </p>
                  <ul className="text-[10px] text-amber-700 dark:text-amber-500">
                    {alert.triggerHistory.slice(0, 3).map((h, i) => (
                      <li key={i}>
                        {new Date(h.timestamp).toLocaleString()}: Rate was{" "}
                        {h.priceAtTrigger}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
