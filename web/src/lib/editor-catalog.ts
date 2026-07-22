/** CapCut-like catalogs shared by VideoEditorStudio + /api/jobs/edit */

export const EFFECTS = [
  { id: "none", label: "None", css: "none" },
  { id: "cinematic", label: "Cinematic", css: "contrast(1.08) saturate(1.12) brightness(1.02)" },
  { id: "vivid", label: "Vivid", css: "contrast(1.14) saturate(1.28) brightness(1.03)" },
  { id: "soft", label: "Soft", css: "contrast(0.96) saturate(0.92) brightness(1.04)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.2)" },
  { id: "punch", label: "Punch", css: "contrast(1.18) saturate(1.22) brightness(1.05)" },
  { id: "vignette", label: "Vignette", css: "contrast(1.06) saturate(1.08)" },
  { id: "warm", label: "Warm", css: "contrast(1.06) saturate(1.1) sepia(0.15)" },
  { id: "cool", label: "Cool", css: "contrast(1.05) saturate(1.05) hue-rotate(15deg)" },
  { id: "teal_orange", label: "Teal & Orange", css: "contrast(1.1) saturate(1.15) hue-rotate(-8deg)" },
  { id: "vintage", label: "Vintage", css: "contrast(0.95) saturate(0.75) sepia(0.25)" },
  { id: "bleach", label: "Bleach", css: "contrast(1.25) saturate(0.55) brightness(1.08)" },
  { id: "neon", label: "Neon", css: "contrast(1.2) saturate(1.45) brightness(1.04)" },
  { id: "pastel", label: "Pastel", css: "contrast(0.92) saturate(0.85) brightness(1.06)" },
  { id: "drama", label: "Drama", css: "contrast(1.22) saturate(0.95) brightness(0.97)" },
  { id: "glow", label: "Glow", css: "contrast(1.05) saturate(1.12) brightness(1.04) blur(0.3px)" },
  { id: "sharp", label: "Sharp", css: "contrast(1.08) saturate(1.05)" },
  { id: "dream", label: "Dream", css: "contrast(0.98) saturate(1.15) brightness(1.05) blur(0.6px)" },
  { id: "chrome", label: "Chrome", css: "contrast(1.15) saturate(0.4)" },
  { id: "sunset", label: "Sunset", css: "contrast(1.06) saturate(1.18) sepia(0.2) hue-rotate(-12deg)" },
  { id: "arctic", label: "Arctic", css: "contrast(1.08) saturate(0.85) brightness(1.03) hue-rotate(20deg)" },
  { id: "ember", label: "Ember", css: "contrast(1.1) saturate(1.2) sepia(0.3)" },
  { id: "matrix", label: "Matrix", css: "contrast(1.15) saturate(1.4) hue-rotate(70deg)" },
  { id: "retro_tv", label: "Retro TV", css: "contrast(1.1) saturate(1.2) sepia(0.1)" },
  { id: "film_grain", label: "Film grain", css: "contrast(1.05) saturate(1.05)" },
  { id: "high_key", label: "High key", css: "brightness(1.12) contrast(0.92) saturate(1.05)" },
  { id: "low_key", label: "Low key", css: "brightness(0.92) contrast(1.2) saturate(0.9)" },
  { id: "sepia", label: "Sepia", css: "sepia(0.85) contrast(1.05)" },
  { id: "duo_pink", label: "Duo pink", css: "contrast(1.08) saturate(1.3) hue-rotate(-30deg)" },
  { id: "clarity", label: "Clarity", css: "contrast(1.1) saturate(1.08)" },
] as const;

export const MOTIONS = [
  { id: "none", label: "None" },
  { id: "slow_push", label: "Slow push" },
  { id: "punch_in", label: "Punch in" },
  { id: "rise", label: "Rise" },
  { id: "drift_left", label: "Drift left" },
  { id: "drift_right", label: "Drift right" },
  { id: "snap_zoom", label: "Snap zoom" },
  { id: "pull_out", label: "Pull out" },
  { id: "tilt_up", label: "Tilt up" },
  { id: "tilt_down", label: "Tilt down" },
  { id: "handheld", label: "Handheld" },
  { id: "orbit", label: "Orbit" },
  { id: "crash_zoom", label: "Crash zoom" },
] as const;

export const FADES = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "fadeblack", label: "Fade black" },
  { id: "fadewhite", label: "Fade white" },
] as const;

export const TRANSITIONS = [
  { id: "fade", label: "Fade" },
  { id: "dissolve", label: "Dissolve" },
  { id: "fadeblack", label: "Fade black" },
  { id: "fadewhite", label: "Fade white" },
  { id: "fadegrays", label: "Fade gray" },
  { id: "pixelize", label: "Pixelize" },
  { id: "distance", label: "Distance" },
  { id: "radial", label: "Radial" },
  { id: "hblur", label: "Blur" },
  { id: "wipeleft", label: "Wipe ←" },
  { id: "wiperight", label: "Wipe →" },
  { id: "wipeup", label: "Wipe ↑" },
  { id: "wipedown", label: "Wipe ↓" },
  { id: "wipetl", label: "Wipe TL" },
  { id: "wipetr", label: "Wipe TR" },
  { id: "wipebl", label: "Wipe BL" },
  { id: "wipebr", label: "Wipe BR" },
  { id: "slideleft", label: "Slide ←" },
  { id: "slideright", label: "Slide →" },
  { id: "slideup", label: "Slide ↑" },
  { id: "slidedown", label: "Slide ↓" },
  { id: "smoothleft", label: "Smooth ←" },
  { id: "smoothright", label: "Smooth →" },
  { id: "smoothup", label: "Smooth ↑" },
  { id: "smoothdown", label: "Smooth ↓" },
  { id: "circlecrop", label: "Circle crop" },
  { id: "rectcrop", label: "Rect crop" },
  { id: "circleopen", label: "Circle open" },
  { id: "circleclose", label: "Circle close" },
  { id: "vertopen", label: "Vert open" },
  { id: "vertclose", label: "Vert close" },
  { id: "horzopen", label: "Horz open" },
  { id: "horzclose", label: "Horz close" },
  { id: "diagtl", label: "Diag TL" },
  { id: "diagtr", label: "Diag TR" },
  { id: "diagbl", label: "Diag BL" },
  { id: "diagbr", label: "Diag BR" },
  { id: "hlslice", label: "H slice L" },
  { id: "hrslice", label: "H slice R" },
  { id: "vuslice", label: "V slice U" },
  { id: "vdslice", label: "V slice D" },
  { id: "squeezeh", label: "Squeeze H" },
  { id: "squeezev", label: "Squeeze V" },
  { id: "zoomin", label: "Zoom in" },
] as const;

export const SUBTITLE_STYLES = [
  { id: "classic", label: "Classic" },
  { id: "karaoke_gold", label: "Karaoke gold" },
  { id: "box_white", label: "Box white" },
  { id: "neon_pink", label: "Neon pink" },
  { id: "minimal", label: "Minimal" },
  { id: "impact", label: "Impact" },
  { id: "soft_shadow", label: "Soft shadow" },
  { id: "yellow_pop", label: "Yellow pop" },
  { id: "lower_third", label: "Lower third" },
  { id: "hook_banner", label: "Hook banner" },
] as const;

export const TEXT_STYLES = [
  { id: "bold_center", label: "Bold center" },
  { id: "hook_top", label: "Hook top" },
  { id: "caption_bottom", label: "Caption bottom" },
  { id: "box_lower", label: "Box lower" },
  { id: "tiny_credit", label: "Tiny credit" },
  { id: "mega_title", label: "Mega title" },
] as const;

export const EFFECT_IDS: Set<string> = new Set(EFFECTS.map((e) => e.id));
export const MOTION_IDS: Set<string> = new Set(MOTIONS.map((m) => m.id));
export const FADE_IDS: Set<string> = new Set(FADES.map((f) => f.id));
export const TRANSITION_IDS: Set<string> = new Set(TRANSITIONS.map((t) => t.id));
export const SUBTITLE_STYLE_IDS: Set<string> = new Set(
  SUBTITLE_STYLES.map((s) => s.id),
);
export const TEXT_STYLE_IDS: Set<string> = new Set(TEXT_STYLES.map((s) => s.id));
