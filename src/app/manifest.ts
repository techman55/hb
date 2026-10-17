import type { MetadataRoute } from "next";

// Ask the browser to open dibs.school links in the installed app instead of a tab. Chrome on
// Android does this for installed apps already; desktop Chrome reads `handle_links` (not in
// Next's types yet). iOS ignores both, so friend codes can also be scanned inside the app.
type Manifest = MetadataRoute.Manifest & { handle_links?: "auto" | "preferred" | "not-preferred" };

export default function manifest(): Manifest {
  return {
    name: "Dibs",
    short_name: "Dibs",
    description: "Rent what you need for a day or a week from students at your school.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    handle_links: "preferred",
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    background_color: "#f6f6f3",
    theme_color: "#f6f6f3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed copies so Android launchers can apply their own mask shape.
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
