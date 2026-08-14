import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { markAppStart } from "@/lib/search-metrics";
import { scheduleServiceWorkerRegistration } from "@/lib/register-service-worker";

markAppStart();

createRoot(document.getElementById("root")!).render(<App />);

scheduleServiceWorkerRegistration();
