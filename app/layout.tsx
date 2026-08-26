import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "税务合规看板",
  description: "本地多主体税务合规工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
