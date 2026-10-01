import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OLP AI KMA 2026 | Olympic Trí tuệ Nhân tạo - Học viện Kỹ thuật Mật mã",
  description: "Hệ thống thi Olympic Trí tuệ Nhân tạo OLP AI KMA 2026 phục vụ cuộc thi cấp trường của Học viện Kỹ thuật Mật mã.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen flex flex-col font-sans selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
