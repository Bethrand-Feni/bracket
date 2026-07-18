import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "https://bracket.example";
  return {
    title: "BRACKET — Start the game",
    description:
      "Create, run, and share single elimination, double elimination, round robin, and Swiss tournaments in minutes.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "BRACKET — Build the bracket. Start the game.",
      description: "Create and run a tournament in minutes. No account required.",
      type: "website",
      images: [{ url: new URL("/og.png", origin).toString(), width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "BRACKET — Build the bracket. Start the game.",
      description: "Create and run a tournament in minutes. No account required.",
      images: [new URL("/og.png", origin).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
