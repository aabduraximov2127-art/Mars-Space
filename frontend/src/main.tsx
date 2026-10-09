import "@/styles/index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";

import { router } from "@/app/router";
import { parseApiError } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => {
        const status = parseApiError(error).status;
        if (status && status >= 400 && status < 500) return false;
        return failures < 2;
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
