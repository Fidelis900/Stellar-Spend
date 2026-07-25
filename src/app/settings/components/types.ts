export type SettingsSection =
  | "profile"
  | "security"
  | "appearance"
  | "preferences"
  | "privacy";

export const SETTINGS_SECTIONS: SettingsSection[] = [
  "profile",
  "security",
  "appearance",
  "preferences",
  "privacy",
];

export interface NotificationPrefs {
  email: boolean;
  push: boolean;
  marketing: boolean;
}
