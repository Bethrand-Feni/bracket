import { createApp } from "vue";
import BracketApp from "./BracketApp.vue";
import { createBracketRouter } from "./router";

export function mountBracketApp(element: HTMLElement) {
  const app = createApp(BracketApp);
  app.use(createBracketRouter());
  app.mount(element);
  return () => app.unmount();
}
