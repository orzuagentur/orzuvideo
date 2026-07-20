/** Built-in background music groups for AI Training. */

export type MusicGroupDef = {
  id: string;
  label: string;
  description: string;
  /** Search query for ~15 tracks */
  query: string;
  /** ~45 seconds of spoken demo text for voice preview over this group's music */
  demoText: string;
};

/** ~45s spoken English (~110-130 words) per group. */
export const MUSIC_GROUPS: MusicGroupDef[] = [
  {
    id: "epic",
    label: "Epic & cinematic",
    description: "Orchestral, trailer energy",
    query: "epic soundtrack orchestral",
    demoText:
      "This is your epic cinematic music bed. Big drums, wide strings, and trailer energy so every Short feels like a movie opening in the first three seconds. Listen how the voice sits on top of the swell: clear in the hook, strong through the story, and still powerful when the beat hits again. Use this when you want drama, scale, and a scroll-stopping first line that sounds expensive without drowning the words.",
  },
  {
    id: "motivational",
    label: "Motivational",
    description: "Uplifting drive for hooks",
    query: "motivational energetic upbeat",
    demoText:
      "This is your motivational drive track. A clear beat and rising energy that push the viewer forward from the first second. Hear how the voice stays sharp on the challenge, then rides the lift into the tip and the call to action. Perfect when the hook says wake up, take control, or start today — music that supports urgency without sounding fake or too loud over the narration.",
  },
  {
    id: "dark",
    label: "Dark & intense",
    description: "Gritty, dramatic beds",
    query: "dark ambient electronic intense",
    demoText:
      "This is your dark intense music bed. Low bass, a tense pulse, and space for harsh truths or warnings. The voice should feel close and serious while the music keeps pressure underneath. Use it for stories that need grit, contrast, or a cold opening — then let the beat tighten as the message lands. Keep the mix balanced so every word stays readable and the mood never turns into noise.",
  },
  {
    id: "calm",
    label: "Calm & focus",
    description: "Soft ambient for storytelling",
    query: "calm ambient chill relaxing",
    demoText:
      "This is your calm focus bed. Soft pads and gentle space so storytelling feels clear and easy to follow. The voice leads; the music breathes behind it without stealing attention. Ideal for lessons, explanations, and reflective Shorts where trust matters more than hype. Listen for a smooth midrange, a quiet pocket under the hook, and a soft landing after the final line.",
  },
  {
    id: "upbeat",
    label: "Upbeat & happy",
    description: "Bright pop / feel-good",
    query: "happy upbeat pop energetic",
    demoText:
      "This is your upbeat happy bed. Bright rhythm and feel-good bounce for tips, wins, and lifestyle moments. The voice should smile with the beat: quick hook, clean tips, light CTA. Music that makes the Short feel friendly without racing ahead of the words. Great when you want energy, warmth, and a finish that still sounds polished on phone speakers.",
  },
  {
    id: "lofi",
    label: "Lo-fi chill",
    description: "Laid-back loops",
    query: "lofi chill ambient",
    demoText:
      "This is your lo-fi chill bed. Soft loops and warm texture so the voice stays front and center. Perfect for relaxed storytelling, study vibes, and calm advice where you do not want drums fighting the narration. Hear the pocket under the hook, the gentle loop through the middle, and a quiet fade that leaves the last sentence clear. Easy listening that still feels intentional.",
  },
  {
    id: "workout",
    label: "Workout pump",
    description: "Gym / high energy",
    query: "workout energetic hiphop electronic",
    demoText:
      "This is your workout pump bed. Hard beat and gym energy for training clips, discipline hooks, and Shorts that make people move. The voice cuts through the punch: short commands, strong rhythm, no fluff. Use it when the first second must hit like a coach. Keep the vocal loud enough to win over the kick, then let the beat carry the push into the final CTA.",
  },
  {
    id: "luxury",
    label: "Luxury ambient",
    description: "Premium, soft atmosphere",
    query: "luxury ambient cinematic soft",
    demoText:
      "This is your luxury ambient bed. Smooth, premium atmosphere for brand stories, lifestyle, and a polished voice that sounds expensive. Soft pads, clean space, and elegant motion under the narration. Listen how the hook feels refined, the middle stays calm and confident, and the ending leaves a premium aftertaste. Ideal when the product or persona should feel high-end without loud drops.",
  },
];

export const CUSTOM_GROUP_DEMO_TEXT =
  "This is your custom music group. Listen for about forty-five seconds to how your chosen voice sits on the track you picked, at the volume you set. The hook should stay clear, the middle should feel balanced, and the ending should still leave the last words easy to understand. Adjust music and voice levels until the Short sounds natural on a phone, then save your selection so every new video can reuse this mix.";

export function demoTextForGroup(groupId: string): string {
  if (groupId.startsWith("custom:")) return CUSTOM_GROUP_DEMO_TEXT;
  return (
    MUSIC_GROUPS.find((g) => g.id === groupId)?.demoText ||
    CUSTOM_GROUP_DEMO_TEXT
  );
}

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
  active_group_id: string;
  volume: number;
  /** Voice / narration volume 0.5–1.4 */
  voice_volume: number;
  /** Preferred track IDs inside the active group (AI picks from these) */
  selected_track_ids: string[];
  custom_groups: CustomMusicGroup[];
};

export const defaultMusicPrefs = (): MusicPrefs => ({
  active_group_id: "epic",
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
