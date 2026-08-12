const foundationChecks = [
  "Next.js App Router",
  "Cloudflare Workers via OpenNext",
  "Supabase integration boundary",
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16">
      <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/20 sm:p-12">
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">
          Foundation 01
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          GH-Store is ready for the real build.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          A clean Next.js foundation for the reference store experience, rebuilt
          for Cloudflare and a new visual identity.
        </p>
        <ul className="mt-10 grid gap-3 text-sm text-slate-200 sm:grid-cols-3">
          {foundationChecks.map((check) => (
            <li
              key={check}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
            >
              <span className="mb-2 block text-cyan-300">Ready</span>
              {check}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
