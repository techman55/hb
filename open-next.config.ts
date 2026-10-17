import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is per-user and rendered on request, so no incremental cache is configured.
export default defineCloudflareConfig({});
