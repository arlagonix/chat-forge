import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
      <Toaster position="bottom-right" />
    </ThemeProvider>
  </React.StrictMode>,
);
