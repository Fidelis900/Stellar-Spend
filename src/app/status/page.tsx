import { Metadata } from "next";
import StatusPage from "@/components/StatusPage";

export const metadata: Metadata = {
  title: "System Status - Stellar Spend",
  description: "Real-time system and corridor health status",
};

export default function Status() {
  return <StatusPage />;
}
