import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "우나",
    short_name: "우나",
    description: "우리의 나날들",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    // theme_color: 테마 --background(밝은 모드)에 가까운 값
    background_color: "#fdf7f1", // 시작 화면 바탕: 로고 카드색
    theme_color: "#f8fbfc",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
