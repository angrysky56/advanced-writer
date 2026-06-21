import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Advanced Writer UI",
  description: "Agentic Novel Writing Interface",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
