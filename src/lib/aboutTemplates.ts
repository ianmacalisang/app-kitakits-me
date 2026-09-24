// Starter templates for the profile About page. Each template is a list of
// block seeds — the editor turns them into real blocks with fresh keys.

export type AboutBlockSeed =
  | { type: 'section'; heading: string; body: string }
  | {
      type: 'list'
      heading: string
      items: (string | { title: string; description?: string })[]
    }
  | { type: 'links'; heading: string; items: { label: string; url: string }[] }
  | { type: 'image'; caption: string }
  | { type: 'embed'; url: string; caption: string }

export interface AboutTemplate {
  id: string
  name: string
  description: string
  // Gradient classes behind the mini wireframe preview in the picker card.
  tint: string
  blocks: AboutBlockSeed[]
}

export const ABOUT_TEMPLATES: AboutTemplate[] = [
  {
    id: 'intro',
    name: 'Simple Intro',
    description: 'A friendly hello, a short bio, and your links.',
    tint: 'from-emerald-100/90 to-teal-50/70',
    blocks: [
      {
        type: 'section',
        heading: "Hi, I'm…",
        body: 'Write a few sentences about yourself — where you’re from, what you love, what you do.',
      },
      {
        type: 'list',
        heading: 'A few things about me',
        items: ['📍 Based in…', '💼 I work as…', '🎧 Currently into…'],
      },
      {
        type: 'links',
        heading: 'Find me on',
        items: [{ label: '', url: '' }],
      },
    ],
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'For content creators — what you make and where to find you.',
    tint: 'from-violet-100/80 to-purple-50/60',
    blocks: [
      {
        type: 'section',
        heading: 'What I create',
        body: 'Tell people what kind of content you make and what they can expect.',
      },
      {
        type: 'list',
        heading: 'Content',
        items: ['Vlogs', 'Photography', 'Livestreams'],
      },
      { type: 'embed', url: '', caption: 'My latest video' },
      {
        type: 'links',
        heading: 'My channels',
        items: [
          { label: 'YouTube', url: '' },
          { label: 'TikTok', url: '' },
        ],
      },
    ],
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Resume-style page — skills, experience, and work links.',
    tint: 'from-sky-100/80 to-blue-50/60',
    blocks: [
      {
        type: 'section',
        heading: 'About me',
        body: 'A short professional summary — your role, focus, and what you’re looking for.',
      },
      {
        type: 'list',
        heading: 'Experience',
        items: [
          { title: 'Role · Company', description: 'Years' },
          { title: 'Role · Company', description: 'Years' },
        ],
      },
      {
        type: 'list',
        heading: 'Skills',
        items: ['Skill one', 'Skill two', 'Skill three'],
      },
      {
        type: 'links',
        heading: 'Work & portfolio',
        items: [
          { label: 'Portfolio', url: '' },
          { label: 'LinkedIn', url: '' },
        ],
      },
    ],
  },
  {
    id: 'links',
    name: 'Link Hub',
    description: 'Minimal page that’s just a clean list of your links.',
    tint: 'from-amber-100/80 to-yellow-50/60',
    blocks: [
      {
        type: 'section',
        heading: '',
        body: 'All my links in one place.',
      },
      {
        type: 'links',
        heading: '',
        items: [
          { label: 'Website', url: '' },
          { label: 'Instagram', url: '' },
          { label: 'Facebook', url: '' },
        ],
      },
    ],
  },
  {
    id: 'photo-story',
    name: 'Photo Story',
    description: 'Tell your story with photos, captions, and short notes.',
    tint: 'from-rose-100/80 to-pink-50/60',
    blocks: [
      {
        type: 'section',
        heading: 'My story',
        body: 'Introduce yourself, then let the photos do the talking.',
      },
      { type: 'image', caption: '' },
      {
        type: 'section',
        heading: 'Favorites',
        body: 'Places, food, hobbies — whatever makes you, you.',
      },
      { type: 'image', caption: '' },
    ],
  },
]
