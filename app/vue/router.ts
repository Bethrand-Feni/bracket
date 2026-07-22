import { createRouter, createWebHistory, type RouterHistory } from "vue-router";

const RoutePlaceholder = { render: () => null };

export function createBracketRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: "/", name: "home", component: RoutePlaceholder },
      { path: "/create", name: "create", component: RoutePlaceholder },
      {
        path: "/account/tournaments",
        name: "account-tournaments",
        component: RoutePlaceholder,
      },
      { path: "/local/:localId", name: "local-public", component: RoutePlaceholder },
      {
        path: "/local/:localId/manage",
        name: "local-manage",
        component: RoutePlaceholder,
      },
      {
        path: "/local/:localId/wheel",
        name: "local-wheel",
        component: RoutePlaceholder,
      },
      { path: "/t/:slug", name: "public", component: RoutePlaceholder },
      { path: "/t/:slug/manage", name: "manage", component: RoutePlaceholder },
      { path: "/t/:slug/wheel", name: "wheel", component: RoutePlaceholder },
      { path: "/:pathMatch(.*)*", redirect: "/" },
    ],
    scrollBehavior: () => ({ top: 0 }),
  });
}
