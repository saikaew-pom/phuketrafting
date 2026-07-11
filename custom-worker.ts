// @ts-ignore — .open-next/worker.js is generated at build time
import handler from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(event) {
    // Phase 4: booking-expiry sweep ("*/15 * * * *").
    // Phase 9: pre-arrival reminder emails ("0 1 * * *").
    // Dispatch on event.cron once those jobs exist.
    console.log("cron fired:", event.cron);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Required because the DO bindings live in the generated worker module.
// @ts-ignore
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
