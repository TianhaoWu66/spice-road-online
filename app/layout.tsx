import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "香料商路｜在线桌游",
  description: "和朋友在线经营商队、交易香料、完成订单。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
