import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MealLine — Accessible Food Delivery Assistance",
  description: "Request pantry delivery assistance by phone or accessible text form. Demo build.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to main content</a>
        <header className="site-header">
          <div className="wrap">
            <a className="brand" href="/">MealLine</a>
            <span className="demo-badge">Demo build — synthetic provider</span>
            <nav aria-label="Primary">
              <a href="/intake">Request delivery</a>
              <a href="/staff">Staff</a>
              <a href="/simulator">Simulator</a>
            </nav>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>MealLine demonstration. All providers, people, and requests are synthetic.
            No real pantry integration. A received request is not a confirmed delivery.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
