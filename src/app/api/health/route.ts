import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status: "operational" | "degraded" | "down";
  components: {
    name: string;
    status: "operational" | "degraded" | "down";
    responseTime?: number;
    lastCheck: number;
  }[];
  corridors: {
    corridor: string;
    provider: string;
    status: "operational" | "degraded" | "down";
    lastTransaction: number;
  }[];
  uptime: {
    day: number;
    week: number;
    month: number;
  };
  timestamp: number;
}

export async function GET() {
  // In production, this would check actual services
  const health: HealthStatus = {
    status: "operational",
    components: [
      {
        name: "API",
        status: "operational",
        responseTime: Math.floor(Math.random() * 100) + 20,
        lastCheck: Date.now(),
      },
      {
        name: "Database",
        status: "operational",
        responseTime: Math.floor(Math.random() * 50) + 5,
        lastCheck: Date.now(),
      },
      {
        name: "Stellar Network",
        status: "operational",
        responseTime: Math.floor(Math.random() * 300) + 100,
        lastCheck: Date.now(),
      },
      {
        name: "Payment Providers",
        status: "operational",
        lastCheck: Date.now(),
      },
    ],
    corridors: [
      {
        corridor: "USDC → NGN",
        provider: "Paycrest",
        status: "operational",
        lastTransaction: Date.now() - Math.random() * 600000,
      },
      {
        corridor: "USDC → KES",
        provider: "Paycrest",
        status: "operational",
        lastTransaction: Date.now() - Math.random() * 600000,
      },
      {
        corridor: "USDC → GHS",
        provider: "Paycrest",
        status: "operational",
        lastTransaction: Date.now() - Math.random() * 600000,
      },
      {
        corridor: "USDC → ZAR",
        provider: "Paycrest",
        status: "operational",
        lastTransaction: Date.now() - Math.random() * 600000,
      },
    ],
    uptime: {
      day: 99.98,
      week: 99.95,
      month: 99.87,
    },
    timestamp: Date.now(),
  };

  return NextResponse.json(health);
}
