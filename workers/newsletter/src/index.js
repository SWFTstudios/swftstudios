import { jsonReader, newsletterReady, runAutoSend } from "../../../functions/_lib/newsletter.js";

export default {
  async scheduled(event, env) {
    if (!(await newsletterReady(env.DB))) {
      console.log("newsletter: migration 0010 not applied yet");
      return;
    }
    const summary = await runAutoSend(env.DB, env, jsonReader(env), new Date(event.scheduledTime));
    console.log("newsletter auto-send", JSON.stringify(summary));
  },

  // No public endpoints: everything happens on the schedule.
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
