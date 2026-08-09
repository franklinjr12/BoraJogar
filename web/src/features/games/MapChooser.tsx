import { buildMapLinks, type MapDestination } from './mapLinks';

interface MapChooserProps extends MapDestination {
  actionLabel?: string;
}

export function MapChooser({ actionLabel = 'Abrir mapa do local', ...destination }: MapChooserProps) {
  const links = buildMapLinks(destination);

  return (
    <details className="map-chooser">
      <summary className="text-link">{actionLabel}</summary>
      <div className="map-chooser-options" aria-label="Escolher aplicativo de mapas">
        <a className="text-link" href={links.googleMaps} target="_blank" rel="noreferrer">
          Google Maps
        </a>
        <a className="text-link" href={links.appleMaps} target="_blank" rel="noreferrer">
          Apple Maps
        </a>
        <a className="text-link" href={links.waze} target="_blank" rel="noreferrer">
          Waze
        </a>
      </div>
    </details>
  );
}
