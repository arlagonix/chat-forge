import type { ReactNode } from "react";

import { ThemeProvider as AppThemeProvider } from "@/lib/theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <AppThemeProvider>{children}</AppThemeProvider>;
}
