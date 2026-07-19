import Link from "next/link";

const PLATFORMS = [
  { href: "/tiktok", label: "TikTok" },
  { href: "/linkedin", label: "LinkedIn" },
  { href: "/x", label: "X" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-sm flex-col items-center gap-6 px-6 py-32">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Comment Suggester
        </h1>
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Pick a platform to generate comment suggestions.
        </p>
        <div className="flex w-full flex-col gap-3">
          {PLATFORMS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="flex h-12 w-full items-center justify-center rounded-md border border-[#e4e4e7] bg-white text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#fafafa] dark:border-zinc-800 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              {p.label}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
