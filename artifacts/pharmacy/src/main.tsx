import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { markAppStart } from "@/lib/search-metrics";

markAppStart();

createRoot(document.getElementById("root")!).render(<App />);
