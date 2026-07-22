import { HealthStatus } from "./components/HealthStatus";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Fast Time Entry</h1>
      <p className="text-sm opacity-70">
        Walking skeleton. Weekly grid and Xero integration land in later slices.
      </p>
      <div className="rounded border border-black/10 p-4 text-sm dark:border-white/15">
        <span className="mr-2 opacity-70">API health:</span>
        <HealthStatus />
      </div>
    </main>
  );
}
