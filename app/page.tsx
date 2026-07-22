import { AuthStatus } from "./components/AuthStatus";
import { ProjectTaskPicker } from "./components/ProjectTaskPicker";
import { WeekGridSection } from "./components/WeekGrid";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Fast Time Entry</h1>
      <p className="text-sm opacity-70">
        Log time to Xero Projects. Sign in with Xero to see this week&rsquo;s
        logged time in the grid below.
      </p>
      <div className="rounded border border-black/10 p-4 text-sm dark:border-white/15">
        <AuthStatus />
      </div>
      <div className="rounded border border-black/10 p-4 text-sm dark:border-white/15">
        <WeekGridSection />
      </div>
      <div className="rounded border border-black/10 p-4 text-sm dark:border-white/15">
        <ProjectTaskPicker />
      </div>
    </main>
  );
}
