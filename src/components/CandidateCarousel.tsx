import { useState } from 'react';
import { DiagonalCarousel } from '@/components/ui/diagonal-carousel';

export interface CarouselCandidate {
  slug: string;
  nombre: string;
  partido: string;
  color: string;
  foto: string;
  intencion: string;
}

// Selector de candidaturas: el carrusel diagonal de Vengeance UI con las fotos
// del JNE; la activa se enlaza con su hoja de vida más abajo en la página.
export default function CandidateCarousel({ items }: { items: CarouselCandidate[] }) {
  const [index, setIndex] = useState(0);
  const actual = items[index];

  return (
    <div className="carrusel" style={{ ['--acc' as string]: actual.color }}>
      <DiagonalCarousel
        items={items.map((c) => ({ src: c.foto, title: c.nombre, alt: `Foto de ${c.nombre}` }))}
        activeIndex={index}
        onActiveIndexChange={setIndex}
        slideSize={220}
        rotationStep={18}
        verticalStep={70}
        inactiveScale={0.62}
        className="carrusel-pista"
        labelClassName="carrusel-nombre"
        imageClassName="carrusel-foto"
        controlsClassName="carrusel-controles"
      />
      <p className="carrusel-pie" aria-live="polite">
        <span>
          {actual.partido} · {actual.intencion}%
        </span>
        <a href={`#${actual.slug}`}>Leer la hoja de vida de {actual.nombre}</a>
      </p>
    </div>
  );
}
