import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "../globals.css";
import { createApp } from "vue";
import BracketApp from "./BracketApp.vue";
import { createBracketRouter } from "./router";

createApp(BracketApp).use(createBracketRouter()).mount("#app");
