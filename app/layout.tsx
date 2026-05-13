import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import ThemeProvider from "@/components/layout/ThemeProvider";
import SessionProviderWrapper from "@/components/layout/SessionProviderWrapper";
import DriveSync from "@/components/layout/DriveSync";
import { LayoutProvider } from "@/components/layout/LayoutContext";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FinView",
  description: "Personal finance hub — income, tax, retirement, investment",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if(localStorage.getItem('fv_theme')!=='light')document.documentElement.classList.add('dark')})()`,
          }}
        />
      </head>
      <body className="min-h-full bg-gray-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 flex flex-col">
        <SessionProviderWrapper>
          <DriveSync>
            <ThemeProvider>
              <LayoutProvider>
                <TopBar />
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  <Sidebar />
                  {/* On mobile sidebar is fixed overlay, so main takes full width */}
                  <main className="flex-1 overflow-auto w-0">{children}</main>
                </div>
              </LayoutProvider>
            </ThemeProvider>
          </DriveSync>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
