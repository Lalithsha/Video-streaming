import type { ReactNode } from "react";

export const metadata = {
  title: "Creator Studio",
  description: "Live classes with MediaSoup"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
