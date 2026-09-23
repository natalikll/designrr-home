import type { Metadata } from 'next';
import { Nunito_Sans, Syne, Manrope, Newsreader, Fraunces, Source_Sans_3, Parisienne, Anton, Courier_Prime, EB_Garamond, Lora, Playfair_Display, Libre_Baskerville, Merriweather, Inter, Montserrat, Poppins, Bebas_Neue } from 'next/font/google';
import './globals.css';

const nunitoSans = Nunito_Sans({
  variable: '--font-nunito-sans',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
});

const syne = Syne({
  variable: '--font-syne',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});

// The book editor's THEMES array has referenced 'Fraunces'/'Source Sans 3' by
// name since it was built, but neither was ever actually loaded — every theme
// using them was silently falling back to Georgia/generic sans-serif.
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});

const sourceSans3 = Source_Sans_3({
  variable: '--font-source-sans-3',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
});

// Text-style preset fonts (Rosewood/Marquee/Typewriter) — none of these looks
// existed in the app before; Manuscript/Statement/Whisper/Gilded reuse the
// four fonts above instead of adding new ones.
const parisienne = Parisienne({
  variable: '--font-parisienne',
  subsets: ['latin'],
  weight: '400',
});

const anton = Anton({
  variable: '--font-anton',
  subsets: ['latin'],
  weight: '400',
});

const courierPrime = Courier_Prime({
  variable: '--font-courier-prime',
  subsets: ['latin'],
  weight: ['400', '700'],
});

/* The book editor's font picker (FONT_OPTIONS) offers a real library, not the
   four families the covers happened to ship with. Everything above this line is
   loaded because some *other* part of the app hardcodes it (themes, text-style
   presets); everything below exists purely so the picker has a serif/sans/display
   range an author would expect from a book tool. Weights are kept narrow (400/700
   where the face has both) — the picker exposes families, not weights. */
const ebGaramond = EB_Garamond({ variable: '--font-eb-garamond', subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'] });
const lora = Lora({ variable: '--font-lora', subsets: ['latin'], weight: ['400', '600'], style: ['normal', 'italic'] });
const playfair = Playfair_Display({ variable: '--font-playfair-display', subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'] });
const libreBaskerville = Libre_Baskerville({ variable: '--font-libre-baskerville', subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'] });
const merriweather = Merriweather({ variable: '--font-merriweather', subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'] });
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], weight: ['400', '600', '700'] });
const montserrat = Montserrat({ variable: '--font-montserrat', subsets: ['latin'], weight: ['400', '600', '700'] });
const poppins = Poppins({ variable: '--font-poppins', subsets: ['latin'], weight: ['400', '600', '700'] });
const bebasNeue = Bebas_Neue({ variable: '--font-bebas-neue', subsets: ['latin'], weight: '400' });

export const metadata: Metadata = {
  title: 'Start creating your book',
  description: 'Create your book with AI — in your authentic voice.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${nunitoSans.variable} ${syne.variable} ${manrope.variable} ${newsreader.variable} ${fraunces.variable} ${sourceSans3.variable} ${parisienne.variable} ${anton.variable} ${courierPrime.variable} ${ebGaramond.variable} ${lora.variable} ${playfair.variable} ${libreBaskerville.variable} ${merriweather.variable} ${inter.variable} ${montserrat.variable} ${poppins.variable} ${bebasNeue.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
