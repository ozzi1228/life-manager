import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우나",
    short_name: "우나",
    description: "우리의 나날들",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    // 테마 --background(밝은 모드)에 가까운 값
    background_color: "#f8fbfc",
    theme_color: "#f8fbfc",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
