import { Metadata } from "next";
import EarningsManagement from "@/components/payroll/EarningsManagement";

export const metadata: Metadata = {
  title: "Earnings Management",
  description: "Configure base earnings and incentives for riders and pickers",
};

export default function EarningsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Earnings Management
        </h1>
        <p className="text-muted-foreground">
          Configure base earnings and incentive structures for riders and
          pickers
        </p>
      </div>
      <EarningsManagement />
    </div>
  );
}
