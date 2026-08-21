export const PROFILE_AVATARS = ["🐪", "🦊", "🦁", "🐯", "🐉", "🦚", "🦅", "🐺"] as const;
export type ProfileAvatar = (typeof PROFILE_AVATARS)[number] | `data:image/${string}`;
export const DEFAULT_PROFILE_AVATAR: ProfileAvatar = PROFILE_AVATARS[0];
export const PHOTO_AVATAR_MAX_LENGTH = 300_000;

export function isPhotoAvatar(value: unknown): value is `data:image/${string}` {
  return typeof value === "string" && value.startsWith("data:image/") && value.length <= PHOTO_AVATAR_MAX_LENGTH;
}

export function isProfileAvatar(value: unknown): value is ProfileAvatar {
  return (
    isPhotoAvatar(value) ||
    (typeof value === "string" && (PROFILE_AVATARS as readonly string[]).includes(value))
  );
}
