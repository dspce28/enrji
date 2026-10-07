/**
 * The four ENRJI energies from "Our Story", each mapped to the slogans that carry it. Client-safe, so the shop
 * filters and the product page can use the names and lines. Each energy has one muted colour, set in CSS as
 * [data-energy='…'] { --energy } (app/globals.css).
 */
export const PILLARS = {
  mental: { name: 'Mental', title: 'Mental ENRJI', line: 'Clear thinking. Continuous learning. Focus.', words: ['mindset', 'focus', 'massive action', 'never give up', 'selling is serving', 'business is seva', 'money is energy'] },
  emotional: { name: 'Emotional', title: 'Emotional ENRJI', line: 'Better relationships. Gratitude. Purpose.', words: ['love is my superpower', 'family is my strength', 'grateful', 'accept & appreciate', 'happiness', 'be the change'] },
  physical: { name: 'Physical', title: 'Physical ENRJI', line: 'Strength. Health. Discipline.', words: ['health is my new religion', 'healthy is new rich', 'energy step', 'energy fade', 'i am energy'] },
  spiritual: { name: 'Spiritual', title: 'Spiritual ENRJI', line: 'Inner peace. Balance. Growth.', words: ['manifesting', 'tathastu', 'believe', 'surrender'] },
} as const;
export type Pillar = keyof typeof PILLARS;

export function pillarOf(p: { baseName: string }): Pillar | null {
  const name = p.baseName.toLowerCase();
  for (const [key, def] of Object.entries(PILLARS) as [Pillar, (typeof PILLARS)[Pillar]][]) {
    if (def.words.some((w) => name.startsWith(w))) return key;
  }
  return null;
}
