// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { createMemoryHistory } from "vue-router";
import { describe, expect, it } from "vitest";
import CreateTournamentPage from "../app/vue/features/create/CreateTournamentPage.vue";
import TournamentStageSwitcher from "../app/vue/features/tournament/TournamentStageSwitcher.vue";
import AppModal from "../app/vue/components/ui/AppModal.vue";
import AppButton from "../app/vue/components/ui/AppButton.vue";
import { createBracketRouter } from "../app/vue/router";

describe("Vue feature boundaries", () => {
  it("preserves every public route through Vue Router", async () => {
    const router = createBracketRouter(createMemoryHistory());
    for (const [path, name] of [
      ["/", "home"],
      ["/create", "create"],
      ["/account/tournaments", "account-tournaments"],
      ["/local/local-id/manage", "local-manage"],
      ["/local/local-id/wheel", "local-wheel"],
      ["/t/hosted/manage", "manage"],
      ["/t/hosted/wheel", "wheel"],
    ]) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe(name);
    }
  });

  it("keeps preliminary settings in the extracted modal", async () => {
    const router = createBracketRouter(createMemoryHistory());
    await router.push("/create");
    await router.isReady();
    const wrapper = mount(CreateTournamentPage, {
      attachTo: document.body,
      global: { plugins: [router] },
    });
    await wrapper.get("button:nth-child(4)").trigger("click");
    const settings = wrapper.get('button[aria-label="Open swiss settings"]');
    expect(settings.text()).toContain("⚙");
    await settings.trigger("click");
    expect(document.body.textContent).toContain("Swiss rounds");
    expect(document.body.textContent).toContain("Save settings");
    wrapper.unmount();
  });

  it("marks completed stage traversal items without owning tournament state", () => {
    const wrapper = mount(TournamentStageSwitcher, {
      props: {
        stages: [
          { id: "preliminary", label: "Swiss", status: "complete" },
          { id: "qualifiers", label: "Qualifiers", status: "review" },
          { id: "knockout", label: "Knockout", status: "preview" },
        ],
        selectedStageId: "qualifiers",
        activeStageId: "qualifiers",
      },
    });
    expect(wrapper.get(".stage-complete").text()).toContain("Swiss");
    expect(wrapper.get(".selected.current").text()).toContain("Qualifiers");
  });

  it("closes the shared modal with Escape", async () => {
    const wrapper = mount(AppModal, { props: { open: true, title: "Settings", onClose: () => wrapper.setProps({ open: false }) } });
    await wrapper.vm.$nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    wrapper.unmount();
  });

  it("supports full-width shared primary actions", () => {
    const wrapper = mount(AppButton, { props: { variant: "primary", full: true }, slots: { default: "Continue" } });
    expect(wrapper.get("button").classes()).toContain("w-full");
    expect(wrapper.text()).toBe("Continue");
  });
});
