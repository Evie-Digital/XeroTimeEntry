import { AuthStatus } from "./components/AuthStatus";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Fast Time Entry</h1>
      <p className="text-sm opacity-70">
        Log time to Xero Projects. Sign in with Xero to get started — the weekly
        grid lands in a later slice.
      </p>
      <div className="rounded border border-black/10 p-4 text-sm dark:border-white/15">
        <AuthStatus />
      </div>
    </main>
  );
}
