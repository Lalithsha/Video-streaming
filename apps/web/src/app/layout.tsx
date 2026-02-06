import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

export const metadata = {
  title: "Creator Studio",
  description: "Live classes with MediaSoup",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
