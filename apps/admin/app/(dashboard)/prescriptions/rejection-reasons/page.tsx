import { RejectionReasonsTable } from "@/components/prescriptions/RejectionReasonsTable";
import { RejectionReasonsStats } from "@/components/prescriptions/RejectionReasonsStats";

export default function RejectionReasonsPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Rejection Reasons</h2>
        <div className="flex items-center space-x-2"></div>
      </div>
      <RejectionReasonsStats />
      <div className="hidden h-full flex-1 flex-col space-y-8 md:flex">
        <RejectionReasonsTable />
      </div>
    </div>
  );
}
