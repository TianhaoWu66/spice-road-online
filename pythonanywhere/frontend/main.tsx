import { createRoot } from "react-dom/client";
import Game from "../../app/game";
import "../../app/globals.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("缺少 root 挂载点");

createRoot(rootElement).render(<Game />);
