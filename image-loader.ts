import type { ImageLoaderProps } from "next/image";
import { cloudinaryUrl } from "@/lib/cloudinary";

// src passed to next/image is a Cloudinary public_id (not a URL) for
// records with a cover_image_id; anything else (local /public assets) is
// passed through unchanged.
export default function cloudinaryLoader({ src, width }: ImageLoaderProps) {
  if (src.startsWith("/") || src.startsWith("http")) {
    return src;
  }
  return cloudinaryUrl(src, width);
}
