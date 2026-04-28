"use client";

const footerLinks = [
  { label: "About", href: "#" },
  { label: "Contact", href: "#" },
  { label: "Privacy", href: "#" }
];

export function AppFooter() {
  return (
    <footer className="border-t border-[var(--panel-border)] bg-white text-sm">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center justify-between gap-3 px-4 py-5 text-center text-[var(--muted)] sm:px-6 md:flex-row md:text-left lg:px-8">
        <p className="font-medium text-[var(--foreground)]">Atlas Wealth OS</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="transition hover:text-[var(--foreground)]"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
