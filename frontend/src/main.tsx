import "./instrument";

import React from "react";
import ReactDOM from "react-dom/client";
import { reactErrorHandler } from "@sentry/react";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
