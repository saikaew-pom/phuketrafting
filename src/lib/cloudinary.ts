// Not secret -- cloud name and an unsigned upload preset are both meant to
// be used from the browser (see plan §1a for why Cloudinary replaced
// Cloudflare Images in Phase 2, and why unsigned uploads need no server
// secret at all).
export const CLOUDINARY_CLOUD_NAME = "daxyt9sso";
export const CLOUDINARY_UPLOAD_PRESET = "phuketrafting_unsigned";

/** Delivery URL for a stored Cloudinary public_id, with f_auto,q_auto negotiation. */
export function cloudinaryUrl(publicId: string, width: number): string {
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto,w_${width}/${publicId}`;
}
