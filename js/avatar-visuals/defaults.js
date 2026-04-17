/** Default mouth position for the default NPC avatar */
export const DEFAULT_MOUTH = { cx: 983, cy: 1028, halfW: 128, halfH: 43, rot: 0 };

/** Default eye positions for the default NPC avatar */
export const DEFAULT_EYES = {
  left:  { cx: 838, cy: 751, halfW: 77, halfH: 60, rot: 0 },
  right: { cx: 1132, cy: 746, halfW: 73, halfH: 56, rot: 0 },
};

/** Default mouth/face color palette */
export const DEFAULT_MOUTH_COLORS = {
  lipTop:       [145, 95, 78],
  lipBottom:    [155, 105, 85],
  lipEdge:      [130, 82, 65],
  lipHighlight: [175, 135, 110],
  lipCorner:    [125, 85, 68],
  cavityDeep:   [55, 32, 25],
  cavityMid:    [80, 52, 42],
  teethLight:   [195, 185, 170],
  teethShade:   [168, 155, 138],
  gumColor:     [145, 75, 62],
  tongueMid:    [155, 85, 70],
  tongueDark:   [130, 65, 52],
  skinMid:      [168, 118, 92],
  skinDark:     [145, 100, 78],
  beardTone:    [110, 78, 60],
};

/** Default eye/skin color palette */
export const DEFAULT_EYE_COLORS = {
  skinLight: [226, 128, 75],
  skinMid:   [192, 109, 64],
  skinDark:  [158,  90, 53],
  browColor: [113,  64, 38],
};

/** Default blink timing */
export const DEFAULT_BLINK = {
  minInterval: 2500,
  maxInterval: 6000,
  doubleBlink: 0.15,
  closeSpeed: 22,
  openSpeed: 14,
  holdMin: 40,
  holdMax: 100,
};

/**
 * Default character-to-viseme mapping.
 * Bulgarian Cyrillic + Latin fallback.
 */
export const DEFAULT_CHAR_VISEME = {
  'а':'A','ъ':'A','х':'A','р':'A',
  'е':'E','г':'E','к':'E','я':'E',
  'и':'I','й':'I','с':'I','з':'I','ц':'I','ж':'I','ч':'I','щ':'I','ш':'I',
  'о':'O',
  'у':'U','ю':'U',
  'ф':'F','в':'F',
  'м':'M','б':'M','п':'M',
  'л':'L',
  'т':'TH','д':'TH','н':'TH',
  'w':'W',
  'a':'A','h':'A',
  'e':'E','q':'E','x':'E',
  'i':'I','y':'I','s':'I','z':'I','c':'I','j':'I',
  'o':'O',
  'u':'U',
  'f':'F',
  'm':'M','b':'M','p':'M',
  'l':'L',
  't':'TH','d':'TH','n':'TH',
  'k':'E','g':'E','r':'A',
};

/** Default mood adjustments — restViseme overrides VISEMES.rest */
export const DEFAULT_MOODS = {
  neutral: {
    blinkScale: 1.0,
    restViseme: { open: 0.08, width: 1,    round: 0, teeth: 0, tongue: 0, smile: 0.4 },
  },
  happy: {
    blinkScale: 0.9,
    restViseme: { open: 0.15, width: 1.15, round: 0, teeth: 0.15, tongue: 0, smile: 0.7 },
  },
  sad: {
    blinkScale: 1.3,
    restViseme: { open: 0.04, width: 0.85, round: 0.15, teeth: 0, tongue: 0, smile: -0.2 },
  },
  angry: {
    blinkScale: 0.7,
    restViseme: { open: 0.1,  width: 1.1,  round: 0, teeth: 0.1, tongue: 0, smile: -0.1 },
  },
};
