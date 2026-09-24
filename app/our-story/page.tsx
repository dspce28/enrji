import type { Metadata } from 'next';
import { getProducts } from '@/lib/catalogue';
import { focus } from '@/lib/focus';
import { Story, type StoryImage } from '@/components/story/Story';

export const revalidate = 3600;
export const metadata: Metadata = { title: 'Our Story', description: 'ENRJI was founded by Sneh Desai to keep you close to the person you decided to become.' };

// Photographs from the store's own galleries: [product handle, image index, description for screen readers].
const HERO: [string, number, string] = ['i-am-energy-sweatshirt', 0, 'Sneh Desai on stage'];
const INTRO: [string, number, string] = ['surrender-smile-rise', 0, 'Sneh Desai at Live Like Krishna'];
const FILM: [string, number, string][] = [
  ['business-is-seva', 0, 'Sneh Desai on stage in the Business Is Seva sweatshirt'],
  ['selling-is-serving-sweatshirt', 0, 'Sneh Desai speaking in the Selling Is Serving sweatshirt'],
  ['manifesting-sweatshirt', 0, 'Sneh Desai on stage in the Manifesting sweatshirt'],
  ['selling-is-serving-tee', 0, 'Sneh Desai on stage in the Selling Is Serving tee'],
  ['believe', 0, 'Sneh Desai at Live Like Krishna in the Believe sweatshirt'],
  ['selling-is-serving-sweatshirt', 1, 'Sneh Desai on stage'],
];
const ENERGIES: [string, number, string][] = [
  ['mindset-is-everything-sweatshirt', 1, 'Mindset Is Everything sweatshirt, worn'],
  ['love-is-my-superpower', 3, 'Love Is My Superpower tee, worn'],
  ['healthy-is-new-rich-sweatshirt', 0, 'Healthy Is The New Rich sweatshirt, worn'],
  ['believe', 1, 'Believe sweatshirt, worn'],
];
const OBJECTS: [string, number, string][] = [
  ['believe', 3, 'The Believe sweatshirt, folded'],
  ['selling-is-serving-tee', 3, 'The Selling Is Serving tee, folded'],
  ['surrender-smile-rise', 3, 'The Surrender. Smile. Rise. sweatshirt, folded'],
];
const END: [string, number, string] = ['manifesting-sweatshirt', 0, 'Sneh Desai on stage'];

export default async function OurStory() {
  const byHandle = new Map((await getProducts()).map((p) => [p.handle, p]));
  const pick = ([h, i, alt]: [string, number, string]): StoryImage | null => {
    const im = byHandle.get(h)?.images[i];
    return im ? { src: im.src, alt, style: focus(im.src) } : null;
  };
  const list = (xs: [string, number, string][]) => xs.map(pick).filter((x): x is StoryImage => !!x);
  return <Story hero={pick(HERO)} intro={pick(INTRO)} film={list(FILM)} energies={list(ENERGIES)} objects={list(OBJECTS)} end={pick(END)} />;
}
