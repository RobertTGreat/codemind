import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { configureMonacoEnvironment } from "./ui/features/editor/monacoEnvironment";

configureMonacoEnvironment();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
