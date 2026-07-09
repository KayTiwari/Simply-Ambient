// Band keys drive the background palettes and preset theming in App.tsx:
// every entry here has a matching Palette in App.tsx's PALETTES record.
export type BandKey =
  | 'none' | 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma' | 'tuning'
  | 'root' | 'sacral' | 'solar' | 'heart' | 'throat' | 'thirdEye' | 'crown'
  | 'vata' | 'pitta' | 'kapha';
