/** Music prefs for AI Training — groups come from the platform music library genres. */

export type MusicTrackRef = {
  id: string;
  name: string;
  artist: string;
  previewUrl: string | null;
  thumb?: string | null;
  durationSec?: number | null;
};

export type CustomMusicGroup = {
  id: string;
  name: string;
  tracks: MusicTrackRef[];
};

export type MusicPrefs = {
  /** Genre slug or custom:uuid */
  active_group_id: string;
  volume: number;
  /** Voice / narration volume 0.5–1.4 */
  voice_volume: number;
  /** Preferred track IDs inside the active group (AI picks from these) */
  selected_track_ids: string[];
  custom_groups: CustomMusicGroup[];
};

export type LibraryGenre = {
  id: string;
  name: string;
  slug: string;
  trackCount?: number;
};

export const CUSTOM_GROUP_DEMO_TEXT =
  "This is your custom music group. Listen for about forty-five seconds to how your chosen voice sits on the track you picked, at the volume you set. The hook should stay clear, the middle should feel balanced, and the ending should still leave the last words easy to understand. Adjust music and voice levels until the Short sounds natural on a phone, then save your selection so every new video can reuse this mix.";

export const LIBRARY_GROUP_DEMO_TEXT =
  "This is your library music bed from the OrzuAi music genres. Listen how the voice sits on top of the track: clear in the hook, strong through the story, and still powerful when the beat hits again. Use the volume sliders until every word stays readable on a phone speaker.";

export function demoTextForGroup(groupId: string): string {
  if (groupId.startsWith("custom:")) return CUSTOM_GROUP_DEMO_TEXT;
  return LIBRARY_GROUP_DEMO_TEXT;
}

export const defaultMusicPrefs = (): MusicPrefs => ({
  active_group_id: "",
  volume: 0.58,
  voice_volume: 1.05,
  selected_track_ids: [],
  custom_groups: [],
});

export function clampMusicVolume(v: number): number {
  if (!Number.isFinite(v)) return 0.58;
  return Math.min(1, Math.max(0.15, v));
}

export function clampVoiceVolume(v: number): number {
  if (!Number.isFinite(v)) return 1.05;
  return Math.min(1.4, Math.max(0.5, v));
}
