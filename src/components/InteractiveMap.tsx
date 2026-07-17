import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Photo, BaseMapLayer } from "../types";
import { BASE_MAP_LAYERS } from "../data/baseMaps";
import { Compass, Map } from "lucide-react";

interface InteractiveMapProps {
  photos: Photo[];
  selectedPhoto: Photo | null;
  onMapClick: (lat: number, lng: number) => void;
  pendingCoords: { lat: number; lng: number } | null;
  onDeletePhoto: (id: string) => Promise<void>;
  onSelectPhoto: (photo: Photo | null) => void;
  onViewPhoto?: (photo: Photo) => void;
  username: string;
  theme: "light" | "dark";
}

export default function InteractiveMap({
  photos,
  selectedPhoto,
  onMapClick,
  pendingCoords,
  onDeletePhoto,
  onSelectPhoto,
  onViewPhoto,
  username,
  theme
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const pendingMarkerRef = useRef<L.Marker | null>(null);

  // Active base map layer state
  const [activeLayerId, setActiveLayerId] = useState<string>(theme === "dark" ? "cartodb-dark" : "osm");
  const [showLayerSelector, setShowLayerSelector] = useState<boolean>(false);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Standard starting center (e.g., beautiful global view or central India/US coordinates)
    // Let's default to a nice overview (lat: 20.5937, lng: 78.9629 is central India, let's use a nice zoom 4 overview)
    const initialLat = 20.5937;
    const initialLng = 78.9629;
    
    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 4,
      zoomControl: false, // We'll render zoom in a clean custom spot or use standard leaflet zoom styled
    });

    // Add standard zoom control at the top-right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Set first tile layer based on current theme
    const initialLayerId = theme === "dark" ? "cartodb-dark" : "osm";
    const initialLayer = BASE_MAP_LAYERS.find(l => l.id === initialLayerId) || BASE_MAP_LAYERS[0];
    const tileLayer = L.tileLayer(initialLayer.url, {
      attribution: initialLayer.attribution,
      maxZoom: 19
    }).addTo(map);

    tileLayerRef.current = tileLayer;
    mapRef.current = map;

    // Listen to map clicks
    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });

    // Cleanup map on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 1b. Handle Theme Changes dynamically
  useEffect(() => {
    if (!mapRef.current) return;
    const targetLayerId = theme === "dark" ? "cartodb-dark" : "osm";
    if (activeLayerId !== targetLayerId) {
      const layer = BASE_MAP_LAYERS.find(l => l.id === targetLayerId);
      if (layer) {
        changeBaseMap(layer);
      }
    }
  }, [theme]);

  // 2. Handle Base Map Layer Change
  const changeBaseMap = (layer: BaseMapLayer) => {
    if (!mapRef.current) return;
    setActiveLayerId(layer.id);

    // Remove current tile layer
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }

    // Add new tile layer
    const newTileLayer = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: layer.id === "esri-satellite" ? 18 : 19
    }).addTo(mapRef.current);

    tileLayerRef.current = newTileLayer;
    setShowLayerSelector(false);
  };

  // 3. Handle Pending Coords Marker (when user clicks on map to set a place)
  useEffect(() => {
    if (!mapRef.current) return;

    if (pendingCoords) {
      if (pendingMarkerRef.current) {
        pendingMarkerRef.current.setLatLng([pendingCoords.lat, pendingCoords.lng]);
      } else {
        const pendingIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center">
              <span class="absolute inline-flex h-8 w-8 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <div class="h-6 w-6 rounded-full border-2 border-white bg-emerald-500 shadow-md flex items-center justify-center text-white text-[10px] font-bold">
                ★
              </div>
            </div>
          `,
          className: "custom-pending-marker",
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = L.marker([pendingCoords.lat, pendingCoords.lng], {
          icon: pendingIcon
        }).addTo(mapRef.current);

        pendingMarkerRef.current = marker;
      }

      // Smoothly center the map at the pending coordinates
      mapRef.current.setView([pendingCoords.lat, pendingCoords.lng], 16, {
        animate: true,
        duration: 1.0
      });
    } else {
      if (pendingMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(pendingMarkerRef.current);
        pendingMarkerRef.current = null;
      }
    }
  }, [pendingCoords]);

  // 4. Populate and Sync Photo Markers
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const currentPhotoIds = new Set(photos.map(p => p.id));

    // Remove markers that are no longer in the list
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentPhotoIds.has(id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });

    // Add or update markers for photos
    photos.forEach((photo) => {
      const lat = photo.metadata.lat;
      const lng = photo.metadata.lng;
      
      if (isNaN(lat) || isNaN(lng)) return;

      const photoUrl = `/api/photos/${photo.id}?username=${username}`;

      // Custom icon with preview thumbnail
      const photoIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center group">
            <span class="absolute inline-flex h-12 w-12 animate-pulse rounded-full bg-indigo-500/30 opacity-40"></span>
            <div class="relative flex flex-col items-center">
              <div class="w-11 h-11 rounded-full border-[3px] ${
                selectedPhoto?.id === photo.id 
                  ? "border-amber-500 scale-115 ring-4 ring-amber-500/20" 
                  : "border-white"
              } shadow-lg overflow-hidden bg-gray-200 hover:scale-110 hover:border-indigo-500 duration-200">
                <img src="${photoUrl}" class="w-full h-full object-cover" style="referrerpolicy=no-referrer" alt="Marker" />
              </div>
              <div class="w-2.5 h-2.5 ${
                selectedPhoto?.id === photo.id ? "bg-amber-500" : "bg-white"
              } border border-gray-300 transform rotate-45 -mt-1 shadow-md"></div>
            </div>
          </div>
        `,
        className: "custom-photo-marker",
        iconSize: [44, 44],
        iconAnchor: [22, 44],
        popupAnchor: [0, -44]
      });

      if (markersRef.current[photo.id]) {
        // Update position and icon
        markersRef.current[photo.id].setLatLng([lat, lng]);
        markersRef.current[photo.id].setIcon(photoIcon);
      } else {
        // Create new marker
        const marker = L.marker([lat, lng], { icon: photoIcon }).addTo(map);

        // Standard dynamic popup creation
        const popupContent = document.createElement("div");
        popupContent.className = "p-2 w-64 text-slate-800";
        popupContent.innerHTML = `
          <div class="font-bold text-sm text-slate-900 border-b pb-1 mb-2">${photo.metadata.title}</div>
          <div class="relative w-full h-32 rounded overflow-hidden bg-slate-100 mb-2 border border-slate-200 cursor-pointer group" id="pop-img-${photo.id}">
            <img src="${photoUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="${photo.metadata.title}" />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-semibold">
              <span>🔍 View Fullscreen</span>
            </div>
          </div>
          <p class="text-xs text-slate-600 line-clamp-2 mb-2 italic">
            ${photo.metadata.description || "No description provided."}
          </p>
          <div class="text-[10px] font-mono text-slate-400 flex justify-between mb-3 bg-slate-50 p-1 rounded">
            <span>Lat: ${lat.toFixed(5)}</span>
            <span>Lng: ${lng.toFixed(5)}</span>
          </div>
          <div class="flex gap-2 justify-end">
            <button id="pop-zoom-${photo.id}" class="flex items-center gap-1 text-[11px] px-2 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium rounded transition">
              🔍 Zoom
            </button>
            <button id="pop-del-${photo.id}" class="flex items-center gap-1 text-[11px] px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium rounded transition">
              🗑 Delete
            </button>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 300,
          className: "custom-leaflet-popup"
        });

        // Listen for popup opens to bind dynamic events safely
        marker.on("popupopen", () => {
          onSelectPhoto(photo);
          
          // Bind popup image click to either big view or center/zoom
          const popImg = document.getElementById(`pop-img-${photo.id}`);
          if (popImg) {
            popImg.addEventListener("click", () => {
              if (onViewPhoto) {
                onViewPhoto(photo);
              } else {
                const zoomLevel = 17;
                const targetPoint = map.project([lat, lng], zoomLevel);
                targetPoint.y -= 160;
                const targetLatLng = map.unproject(targetPoint, zoomLevel);
                map.setView(targetLatLng, zoomLevel, {
                  animate: true,
                  duration: 1.0
                });
              }
            });
          }

          // Bind Zoom button
          const zoomBtn = document.getElementById(`pop-zoom-${photo.id}`);
          if (zoomBtn) {
            zoomBtn.addEventListener("click", () => {
              const zoomLevel = 17;
              const targetPoint = map.project([lat, lng], zoomLevel);
              targetPoint.y -= 160;
              const targetLatLng = map.unproject(targetPoint, zoomLevel);
              map.setView(targetLatLng, zoomLevel, {
                animate: true,
                duration: 1.0
              });
            });
          }

          // Bind Delete button
          const delBtn = document.getElementById(`pop-del-${photo.id}`);
          if (delBtn) {
            delBtn.addEventListener("click", async (ev) => {
              ev.stopPropagation();
              if (delBtn.getAttribute("data-confirm") === "true") {
                marker.closePopup();
                await onDeletePhoto(photo.id);
              } else {
                delBtn.setAttribute("data-confirm", "true");
                delBtn.innerHTML = "⚠️ Confirm?";
                delBtn.className = "flex items-center gap-1 text-[11px] px-2 py-1 bg-rose-600 text-white font-semibold rounded transition hover:bg-rose-700 animate-pulse cursor-pointer";
                
                // Add a temporary cancel button if not already added
                const parent = delBtn.parentElement;
                if (parent && !document.getElementById(`pop-cancel-${photo.id}`)) {
                  const cancelBtn = document.createElement("button");
                  cancelBtn.id = `pop-cancel-${photo.id}`;
                  cancelBtn.className = "flex items-center gap-1 text-[11px] px-2 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold rounded transition cursor-pointer";
                  cancelBtn.innerHTML = "Cancel";
                  cancelBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    delBtn.removeAttribute("data-confirm");
                    delBtn.innerHTML = "🗑 Delete";
                    delBtn.className = "flex items-center gap-1 text-[11px] px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium rounded transition cursor-pointer";
                    cancelBtn.remove();
                  });
                  parent.insertBefore(cancelBtn, delBtn);
                }
              }
            });
          }
        });

        marker.on("popupclose", () => {
          onSelectPhoto(null);
        });

        markersRef.current[photo.id] = marker;
      }
    });
  }, [photos, selectedPhoto]);

  // 5. Pan to selected photo from list
  useEffect(() => {
    if (!mapRef.current || !selectedPhoto) return;
    const lat = selectedPhoto.metadata.lat;
    const lng = selectedPhoto.metadata.lng;
    if (isNaN(lat) || isNaN(lng)) return;

    const map = mapRef.current;
    const zoomLevel = map.getZoom() > 15 ? map.getZoom() : 15;
    const targetPoint = map.project([lat, lng], zoomLevel);
    targetPoint.y -= 160;
    const targetLatLng = map.unproject(targetPoint, zoomLevel);

    map.setView(targetLatLng, zoomLevel, {
      animate: true,
      duration: 1.0
    });

    // Automatically trigger marker popup if exists
    const marker = markersRef.current[selectedPhoto.id];
    if (marker && !marker.isPopupOpen()) {
      marker.openPopup();
    }
  }, [selectedPhoto]);

  const activeLayer = BASE_MAP_LAYERS.find(l => l.id === activeLayerId) || BASE_MAP_LAYERS[0];

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 shadow-md dark:shadow-none bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* 1. Map Canvas Target */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* 2. Sleek Floating Base Map Layer Selector */}
      <div className="absolute bottom-4 left-4 z-20">
        <div className="relative">
          <button
            onClick={() => setShowLayerSelector(!showLayerSelector)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl shadow-lg dark:shadow-none border border-slate-200/80 dark:border-slate-800 transition-all active:scale-95"
            id="base-map-trigger"
          >
            <Map className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Layers: {activeLayer.name.split(" ")[0]}</span>
          </button>

          {showLayerSelector && (
            <div 
              className="absolute bottom-11 left-0 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3.5 flex flex-col gap-2 max-h-96 overflow-y-auto animate-in fade-in slide-in-from-bottom-3 duration-200"
              id="base-map-dropdown"
            >
              <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1 pb-1 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <span>Select Base Map</span>
                <Compass className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 animate-spin" style={{ animationDuration: "12s" }} />
              </div>
              
              <div className="flex flex-col gap-1.5 mt-1">
                {BASE_MAP_LAYERS.map((layer) => {
                  const isActive = layer.id === activeLayerId;
                  return (
                    <button
                      key={layer.id}
                      onClick={() => changeBaseMap(layer)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-3 ${
                        isActive
                          ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200"
                          : "border-slate-100 dark:border-slate-800/80 hover:border-slate-200 dark:hover:border-slate-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {/* Colored Indicator */}
                      <div className={`mt-0.5 w-3.5 h-3.5 rounded-full flex-shrink-0 border-2 ${
                        layer.category === "standard" ? "bg-blue-400 border-white dark:border-slate-900" :
                        layer.category === "satellite" ? "bg-emerald-500 border-white dark:border-slate-900" :
                        layer.category === "dark" ? "bg-slate-800 border-white dark:border-slate-900" :
                        layer.category === "light" ? "bg-amber-100 border-amber-400" :
                        "bg-amber-600 border-white dark:border-slate-900"
                      }`} />
                      
                      <div className="flex-1">
                        <div className="text-xs font-bold flex items-center justify-between">
                          <span>{layer.name}</span>
                          {isActive && (
                            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                              active
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-450 mt-0.5 leading-normal">
                          {layer.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Helper Info Box when clicking maps */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 max-w-sm border border-slate-850">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
          <span className="text-[11px] font-medium text-slate-200">
            Tip: Click anywhere on the map to auto-pick coordinates
          </span>
        </div>
      </div>

    </div>
  );
}
