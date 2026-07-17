import { BaseMapLayer } from "../types";

export const BASE_MAP_LAYERS: BaseMapLayer[] = [
  {
    id: "osm",
    name: "OpenStreetMap (Standard)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    description: "Traditional street map with detailed community-contributed physical features and labels.",
    category: "standard"
  },
  {
    id: "esri-satellite",
    name: "Esri World Imagery (Satellite)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    description: "High-resolution global satellite and aerial photography for realistic visualization.",
    category: "satellite"
  },
  {
    id: "cartodb-dark",
    name: "CartoDB Dark Matter (Dark)",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    description: "Sleek, eye-safe dark theme. Excellent for glowing colors and photography elements.",
    category: "dark"
  },
  {
    id: "cartodb-light",
    name: "CartoDB Positron (Light)",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    description: "Minimalist, clean light background layer that highlights custom colored marker tags.",
    category: "light"
  },
  {
    id: "opentopo",
    name: "OpenTopoMap (Topographic)",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    description: "Detailed topographic map with elevation lines, forest shading, and landforms.",
    category: "terrain"
  }
];
