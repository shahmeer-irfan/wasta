"use client";

import MapLibreGL, { type PopupOptions, type MarkerOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type MapContextValue = {
  map: MapLibreGL.Map | null;
  isLoaded: boolean;
};

const MapContext = createContext<MapContextValue | null>(null);

function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMap must be used within a Map component");
  }
  return context;
}

const defaultStyles = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
};

type MapStyleOption = string | MapLibreGL.StyleSpecification;

type MapProps = {
  children?: ReactNode;
  styles?: {
    light?: MapStyleOption;
    dark?: MapStyleOption;
  };
  theme?: "light" | "dark";
} & Omit<MapLibreGL.MapOptions, "container" | "style">;

const DefaultLoader = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-orange-50">
    <div className="flex gap-1">
      <span className="size-1.5 rounded-full bg-orange-400/60 animate-pulse" />
      <span className="size-1.5 rounded-full bg-orange-400/60 animate-pulse [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-orange-400/60 animate-pulse [animation-delay:300ms]" />
    </div>
  </div>
);

function Map({ children, styles, theme = "light", ...props }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isStyleLoaded, setIsStyleLoaded] = useState(false);

  const mapStyles = useMemo(
    () => ({
      dark: styles?.dark ?? defaultStyles.dark,
      light: styles?.light ?? defaultStyles.light,
    }),
    [styles]
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !containerRef.current) return;

    const mapStyle = theme === "dark" ? mapStyles.dark : mapStyles.light;

    const mapInstance = new MapLibreGL.Map({
      container: containerRef.current,
      style: mapStyle,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      ...props,
    });

    const styleDataHandler = () => setIsStyleLoaded(true);
    const loadHandler = () => setIsLoaded(true);

    mapInstance.on("load", loadHandler);
    mapInstance.on("styledata", styleDataHandler);
    mapRef.current = mapInstance;

    return () => {
      mapInstance.off("load", loadHandler);
      mapInstance.off("styledata", styleDataHandler);
      mapInstance.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  const isLoading = !isMounted || !isLoaded || !isStyleLoaded;

  return (
    <MapContext.Provider
      value={{
        map: mapRef.current,
        isLoaded: isMounted && isLoaded && isStyleLoaded,
      }}
    >
      <div ref={containerRef} className="relative w-full h-full">
        {isLoading && <DefaultLoader />}
        {isMounted && children}
      </div>
    </MapContext.Provider>
  );
}

type MapMarkerProps = {
  longitude: number;
  latitude: number;
  children: ReactNode;
  onClick?: (e: MouseEvent) => void;
} & Omit<MarkerOptions, "element">;

type MarkerContextValue = {
  markerRef: React.RefObject<MapLibreGL.Marker | null>;
  markerElementRef: React.RefObject<HTMLDivElement | null>;
  map: MapLibreGL.Map | null;
  isReady: boolean;
};

const MarkerContext = createContext<MarkerContextValue | null>(null);

function useMarkerContext() {
  const context = useContext(MarkerContext);
  if (!context) throw new Error("Marker components must be used within MapMarker");
  return context;
}

function MapMarker({
  longitude,
  latitude,
  children,
  onClick,
  ...markerOptions
}: MapMarkerProps) {
  const { map, isLoaded } = useMap();
  const markerRef = useRef<MapLibreGL.Marker | null>(null);
  const markerElementRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const container = document.createElement("div");
    markerElementRef.current = container;

    const marker = new MapLibreGL.Marker({
      ...markerOptions,
      element: container,
    })
      .setLngLat([longitude, latitude])
      .addTo(map);

    markerRef.current = marker;

    if (onClick) {
      container.addEventListener("click", onClick);
    }

    setIsReady(true);

    return () => {
      if (onClick) container.removeEventListener("click", onClick);
      marker.remove();
      markerRef.current = null;
      markerElementRef.current = null;
      setIsReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded]);

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [longitude, latitude]);

  return (
    <MarkerContext.Provider value={{ markerRef, markerElementRef, map, isReady }}>
      {children}
    </MarkerContext.Provider>
  );
}

type MarkerContentProps = {
  children?: ReactNode;
  className?: string;
};

function MarkerContent({ children, className }: MarkerContentProps) {
  const { markerElementRef, isReady } = useMarkerContext();
  if (!isReady || !markerElementRef.current) return null;

  return createPortal(
    <div className={cn("relative cursor-pointer", className)}>
      {children || <DefaultMarkerIcon />}
    </div>,
    markerElementRef.current
  );
}

function DefaultMarkerIcon() {
  return (
    <div className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
  );
}

type MarkerPopupProps = {
  children: ReactNode;
  className?: string;
  closeButton?: boolean;
} & Omit<PopupOptions, "className">;

function MarkerPopup({
  children,
  className,
  closeButton = false,
  ...popupOptions
}: MarkerPopupProps) {
  const { markerRef, isReady } = useMarkerContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<MapLibreGL.Popup | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isReady || !markerRef.current) return;

    const container = document.createElement("div");
    containerRef.current = container;

    const popup = new MapLibreGL.Popup({
      offset: 16,
      ...popupOptions,
      closeButton: false,
    })
      .setMaxWidth("none")
      .setDOMContent(container);

    popupRef.current = popup;
    markerRef.current.setPopup(popup);
    setMounted(true);

    return () => {
      popup.remove();
      popupRef.current = null;
      containerRef.current = null;
      setMounted(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  const handleClose = () => popupRef.current?.remove();

  if (!mounted || !containerRef.current) return null;

  return createPortal(
    <div className={cn("relative rounded-md border bg-white p-3 text-zinc-900 shadow-md", className)}>
      {closeButton && (
        <button type="button" onClick={handleClose} className="absolute top-1 right-1 z-10 rounded-sm opacity-70 hover:opacity-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>,
    containerRef.current
  );
}

type MapControlsProps = {
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  showZoom?: boolean;
  className?: string;
};

const positionClasses = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-10 right-2",
};

function MapControls({ position = "bottom-right", showZoom = true, className }: MapControlsProps) {
  const { map, isLoaded } = useMap();

  const handleZoomIn = useCallback(() => {
    map?.zoomTo(map.getZoom() + 1, { duration: 300 });
  }, [map]);

  const handleZoomOut = useCallback(() => {
    map?.zoomTo(map.getZoom() - 1, { duration: 300 });
  }, [map]);

  if (!isLoaded) return null;

  return (
    <div className={cn("absolute z-10 flex flex-col gap-1.5", positionClasses[position], className)}>
      {showZoom && (
        <div className="flex flex-col rounded-md border border-orange-200 bg-white shadow-sm overflow-hidden">
          <button onClick={handleZoomIn} className="flex items-center justify-center size-8 hover:bg-orange-50 transition-colors" aria-label="Zoom in">
            <Plus className="size-4 text-zinc-600" />
          </button>
          <div className="h-px bg-orange-200" />
          <button onClick={handleZoomOut} className="flex items-center justify-center size-8 hover:bg-orange-50 transition-colors" aria-label="Zoom out">
            <Minus className="size-4 text-zinc-600" />
          </button>
        </div>
      )}
    </div>
  );
}

type MapRouteProps = {
  coordinates: [number, number][];
  color?: string;
  width?: number;
  opacity?: number;
};

function MapRoute({ coordinates, color = "#f97316", width = 3, opacity = 0.8 }: MapRouteProps) {
  const { map, isLoaded } = useMap();
  const id = useId();
  const sourceId = `route-source-${id}`;
  const layerId = `route-layer-${id}`;

  useEffect(() => {
    if (!isLoaded || !map) return;

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
    });

    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": color, "line-width": width, "line-opacity": opacity },
    });

    return () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map]);

  useEffect(() => {
    if (!isLoaded || !map || coordinates.length < 2) return;
    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
    if (source) {
      source.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } });
    }
  }, [isLoaded, map, coordinates, sourceId]);

  return null;
}

// Auto-fit map to show a bounding box of coordinates
function MapFitBounds({ coordinates }: { coordinates: [number, number][] }) {
  const { map, isLoaded } = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !map || coordinates.length < 2 || fitted.current) return;
    fitted.current = true;

    const lngs = coordinates.map(c => c[0]);
    const lats = coordinates.map(c => c[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];

    map.fitBounds(bounds, { padding: 60, duration: 1000 });
  }, [isLoaded, map, coordinates]);

  return null;
}

export {
  Map,
  useMap,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MapControls,
  MapRoute,
  MapFitBounds,
};
