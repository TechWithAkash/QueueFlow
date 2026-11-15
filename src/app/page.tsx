import Link from "next/link";
import { Logo } from "@/components/logo";
import { DemoButton } from "@/components/demo-button";
import { ThemeToggle } from "@/components/theme-toggle";

const steps = [
  {
    title: "Issue a token",
    body: "Type a name at the desk. The patient gets a code like A-042 and a QR link that shows their place and estimated wait on their own phone.",
  },
  {
    title: "Call to a counter",
    body: "Each counter presses Call next. The waiting-room screen chimes, reads the code aloud and shows which counter to go to.",
  },
  {
    title: "See where waits build up",
    body: "Wait times, queue length through the day, busiest hours by weekday, and a written summary of what to change.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <ThemeToggle />
          <Link href="/login" className="rounded-md px-3 py-2 text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-line bg-surface px-3 py-2 font-medium hover:border-ink-faint"
          >
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <h1 className="font-wide text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Token queues for busy clinic front desks
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-soft">
              QueueFlow replaces the paper token roll. Add patients, reorder or cancel them, call the next one to a
              counter, and put a live board on the waiting-room TV. Every change reaches every screen within a second.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DemoButton variant="primary" size="lg">
                Try the live demo
              </DemoButton>
              <Link href="/register" className="px-2 py-3 font-medium text-teal hover:underline">
                Start with an empty account
              </Link>
            </div>
            <p className="mt-3 text-sm text-ink-faint">
              The demo opens a clinic with three queues and 30 days of history. No sign-up needed.
            </p>
          </div>

          <BoardMock />
        </section>

        <section className="border-t border-line bg-surface">
          <ol className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="font-wide tabular text-3xl font-bold text-amber">{i + 1}</span>
                <div>
                  <h2 className="text-lg font-semibold">{s.title}</h2>
                  <p className="mt-2 text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-8 text-sm text-ink-faint">
        Built with Next.js, MongoDB and Server-Sent Events.
      </footer>
    </div>
  );
}

/** Static picture of the waiting-room board, as it looks on a TV. */
function BoardMock() {
  const serving = [
    { code: "A-041", counter: 1 },
    { code: "A-043", counter: 2, fresh: true },
    { code: "A-039", counter: 3 },
  ];
  return (
    <figure
      aria-label="Example of the waiting-room display"
      className="relative rounded-2xl bg-board p-5 text-board-ink shadow-[0_30px_60px_-30px_rgb(15_42_36/0.6)] sm:p-7"
    >
      <div className="flex items-baseline justify-between">
        <p className="font-wide text-lg font-bold">General OPD</p>
        <p className="tabular text-sm text-board-ink/60">11:42 am</p>
      </div>
      <div className="mt-5 grid gap-3">
        {serving.map((s) => (
          <div
            key={s.code}
            className={
              "flex items-center justify-between rounded-xl px-4 py-3 " +
              (s.fresh ? "bg-amber text-[#2a1d00]" : "bg-white/6")
            }
          >
            <span className="font-wide tabular text-3xl font-extrabold sm:text-4xl">{s.code}</span>
            <span className={"text-sm " + (s.fresh ? "font-semibold" : "text-board-ink/70")}>
              Counter {s.counter}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-sm text-board-ink/60">Up next</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["A-044", "A-045", "A-046", "A-047"].map((c) => (
            <span key={c} className="ticket font-wide tabular bg-white/10 px-3 py-1 text-sm font-bold">
              {c}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">Counter 2 is calling token A-043.</figcaption>
    </figure>
  );
}
