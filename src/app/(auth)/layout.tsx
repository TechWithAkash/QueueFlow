import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      <aside className="relative hidden overflow-hidden bg-board p-10 text-board-ink lg:flex lg:flex-col lg:justify-between">
        <Logo className="text-board-ink [&_span:last-child]:text-board-ink" />
        <div>
          <p className="font-wide text-[9rem] leading-none font-black text-amber tabular">A-043</p>
          <p className="mt-4 text-xl text-board-ink/80">Please go to counter 2</p>
        </div>
        <p className="text-sm text-board-ink/50">The waiting-room screen, as your patients will see it.</p>
      </aside>
      <main className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mb-10 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
