import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CodemindWorkspace } from "./ui/layouts/CodemindWorkspace";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CodemindWorkspace />
    </QueryClientProvider>
  );
}
