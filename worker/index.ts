import { handleApi, handleScheduled, type ApiEnv } from "./api";

interface Env extends ApiEnv {
  ASSETS: Fetcher;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  },
  scheduled(_controller: ScheduledController, env: Env) {
    return handleScheduled(env);
  },
} satisfies ExportedHandler<Env>;
