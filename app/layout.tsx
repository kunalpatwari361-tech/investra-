import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/ui/app-toaster";

export const metadata: Metadata = {
  title: "Atlas Wealth OS",
  description:
    "Premium fintech frontend with an AI financial assistant, live market monitoring, and market-data-focused workflows."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
