import { createApp } from "vue";
import BracketApp from "./BracketApp.vue";

export function mountBracketApp(element: HTMLElement) {
  const app = createApp(BracketApp);
  app.mount(element);
  return () => app.unmount();
}
