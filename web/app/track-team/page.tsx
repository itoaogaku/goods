import { LedgerDashboard } from "@/components/dashboard/ledger-dashboard";

export default function TrackTeamDashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 py-8 sm:px-6">
      <LedgerDashboard ledger="trackteam" />
    </div>
  );
}
