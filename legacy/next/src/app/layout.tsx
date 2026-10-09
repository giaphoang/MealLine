import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Inventory and intake pages must reflect the current database on every request.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nourish — Food Access Infrastructure",
  description: "Voice intake → inventory matching → delivery",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/intakes", label: "Voice Intakes" },
  { href: "/inventory", label: "Inventory" },
  { href: "/shopping-lists", label: "Shopping Lists" },
  { href: "/deliveries", label: "Deliveries" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-gray-50">
        <div className="flex min-h-screen">
          <aside className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col shrink-0">
            <div className="mb-8 px-2">
              <h1 className="text-2xl font-bold text-green-700">Nourish</h1>
              <p className="text-xs text-gray-500">Food access infrastructure</p>
            </div>
            <nav className="space-y-1 flex-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-3 py-2 rounded-lg text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="pt-4 border-t border-gray-200 px-2">
              <p className="text-xs text-gray-400">
                Voice intake → matching → delivery
              </p>
            </div>
          </aside>
          <main className="flex-1 p-8 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
