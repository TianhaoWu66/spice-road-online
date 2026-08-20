import { createRoot } from "react-dom/client";
import Game from "../../app/game";
import "../../app/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("缺少 root 挂载点");

createRoot(rootElement).render(<Game />);
