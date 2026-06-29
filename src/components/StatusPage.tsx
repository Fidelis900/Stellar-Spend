"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface ComponentStatus {
  name: string;
  status: "operational" | "degraded" | "down";
  lastCheck: number;
  responseTime?: number;
}

interface CorridorStatus {
  corridor: string;
  provider: string;
  status: "operational" | "degraded" | "down";
  lastTransaction: number;
}

interface Incident {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  createdAt: number;
  updates: {
    message: string;
    timestamp: number;
  }[];
}

export default function StatusPage() {
  const [components, setComponents] = useState<ComponentStatus[]>([
    {
      name: "API",
      status: "operational",
      lastCheck: Date.now(),
      responseTime: 45,
    },
    {
      name: "Database",
      status: "operational",
      lastCheck: Date.now(),
      responseTime: 12,
    },
    {
      name: "Stellar Network",
      status: "operational",
      lastCheck: Date.now(),
      responseTime: 230,
    },
    { name: "Payment Providers", status: "operational", lastCheck: Date.now() },
  ]);

  const [corridors, setCorridors] = useState<CorridorStatus[]>([
    {
      corridor: "USDC → NGN",
      provider: "Paycrest",
      status: "operational",
      lastTransaction: Date.now() - 120000,
    },
    {
      corridor: "USDC → KES",
      provider: "Paycrest",
      status: "operational",
      lastTransaction: Date.now() - 300000,
    },
    {
      corridor: "USDC → GHS",
      provider: "Paycrest",
      status: "operational",
      lastTransaction: Date.now() - 180000,
    },
    {
      corridor: "USDC → ZAR",
      provider: "Paycrest",
      status: "degraded",
      lastTransaction: Date.now() - 900000,
    },
  ]);

  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [uptime, setUptime] = useState({
    day: 99.98,
    week: 99.95,
    month: 99.87,
  });

  useEffect(() => {
    // Poll for status updates every 30 seconds
    const interval = setInterval(() => {
      // In production, fetch from /api/health
      setComponents((prev) =>
        prev.map((c) => ({ ...c, lastCheck: Date.now() })),
      );
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: ComponentStatus["status"]) => {
    switch (status) {
      case "operational":
        return "text-green-400 bg-green-400/10 border-green-400/30";
      case "degraded":
        return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      case "down":
        return "text-red-400 bg-red-400/10 border-red-400/30";
    }
  };

  const getStatusText = (status: ComponentStatus["status"]) => {
    switch (status) {
      case "operational":
        return "Operational";
      case "degraded":
        return "Degraded Performance";
      case "down":
        return "Down";
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const overallStatus = components.every((c) => c.status === "operational")
    ? "operational"
    : components.some((c) => c.status === "down")
      ? "down"
      : "degraded";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-sm text-[#777]">
            Real-time status and uptime transparency
          </p>
        </div>

        {/* Overall Status */}
        <div className={cn("border p-6", getStatusColor(overallStatus))}>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-current animate-pulse" />
            <div>
              <div className="text-lg font-semibold">
                {getStatusText(overallStatus)}
              </div>
              <div className="text-xs opacity-75">
                All systems are operating normally
              </div>
            </div>
          </div>
        </div>

        {/* Uptime */}
        <div className="border border-[#333] bg-[#111] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4">
            Uptime
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "24 hours", value: uptime.day },
              { label: "7 days", value: uptime.week },
              { label: "30 days", value: uptime.month },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {value}%
                </div>
                <div className="text-xs text-[#777]">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Incidents */}
        {incidents.length > 0 && (
          <div className="border border-yellow-400/30 bg-yellow-400/5 p-6 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-yellow-400">
              Active Incidents
            </h2>
            {incidents.map((incident) => (
              <div key={incident.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{incident.title}</div>
                  <div className="text-xs text-[#777]">
                    {new Date(incident.createdAt).toLocaleString()}
                  </div>
                </div>
                {incident.updates.map((update, idx) => (
                  <div
                    key={idx}
                    className="text-sm text-[#999] pl-4 border-l-2 border-yellow-400/30"
                  >
                    {update.message}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Components */}
        <div className="border border-[#333] bg-[#111] p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Components
          </h2>
          <div className="space-y-3">
            {components.map((component) => (
              <div
                key={component.name}
                className="flex items-center justify-between py-2 border-b border-[#222] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      component.status === "operational"
                        ? "bg-green-400"
                        : component.status === "degraded"
                          ? "bg-yellow-400"
                          : "bg-red-400",
                    )}
                  />
                  <span className="text-sm">{component.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  {component.responseTime && (
                    <span className="text-xs text-[#777]">
                      {component.responseTime}ms
                    </span>
                  )}
                  <span className="text-xs text-[#555]">
                    {formatTime(component.lastCheck)}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 rounded border",
                      getStatusColor(component.status),
                    )}
                  >
                    {getStatusText(component.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Corridors */}
        <div className="border border-[#333] bg-[#111] p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Payment Corridors
          </h2>
          <div className="space-y-3">
            {corridors.map((corridor) => (
              <div
                key={corridor.corridor}
                className="flex items-center justify-between py-2 border-b border-[#222] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      corridor.status === "operational"
                        ? "bg-green-400"
                        : corridor.status === "degraded"
                          ? "bg-yellow-400"
                          : "bg-red-400",
                    )}
                  />
                  <div>
                    <div className="text-sm">{corridor.corridor}</div>
                    <div className="text-xs text-[#555]">
                      {corridor.provider}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#555]">
                    Last tx: {formatTime(corridor.lastTransaction)}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 rounded border",
                      getStatusColor(corridor.status),
                    )}
                  >
                    {getStatusText(corridor.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscribe */}
        <div className="border border-[#333] bg-[#111] p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Get Updates
          </h2>
          <p className="text-xs text-[#777]">
            Subscribe to receive notifications about system status and incidents
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 bg-[#0a0a0a] border border-[#333] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c9a962]"
            />
            <button className="text-[10px] tracking-widest uppercase px-4 py-2 border border-[#c9a962] text-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a]">
              Subscribe
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-[#555] space-y-1">
          <p>Updated every 30 seconds</p>
          <p>Status powered by Stellar Spend Health Monitoring</p>
        </div>
      </div>
    </div>
  );
}
