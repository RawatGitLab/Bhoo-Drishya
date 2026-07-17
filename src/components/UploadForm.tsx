import React, { useRef, useState, useEffect } from "react";
import { UploadCloud, MapPin, Navigation, Image as ImageIcon, X, HelpCircle, Loader2 } from "lucide-react";
import ExifReader from "exifreader";

interface UploadFormProps {
  onUploadSuccess: () => void;
  pendingCoords: { lat: number; lng: number } | null;
  setPendingCoords: (coords: { lat: number; lng: number } | null) => void;
  clearPendingCoords: () => void;
  username: string;
}

export default function UploadForm({
  onUploadSuccess,
  pendingCoords,
  setPendingCoords,
  clearPendingCoords,
  username
}: UploadFormProps) {
  // Form fields
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Status & Error flags
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [exifSuccessMsg, setExifSuccessMsg] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Sync coords if user clicked on map
  useEffect(() => {
    if (pendingCoords) {
      setLat(pendingCoords.lat.toFixed(6));
      setLng(pendingCoords.lng.toFixed(6));
      setError(null);
    }
  }, [pendingCoords]);

  // Clean preview on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Handle file selection
  const handleFileChange = async (selectedFile: File | null) => {
    if (!selectedFile) return;
    
    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, JPEG, WEBP, etc.).");
      return;
    }

    // Revoke old preview
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setError(null);
    setExifSuccessMsg(null);

    // Auto-fill title with original file name (prettified) if title is empty
    if (!title) {
      const nameWithoutExtension = selectedFile.name.substring(0, selectedFile.name.lastIndexOf("."));
      setTitle(nameWithoutExtension.replace(/[-_]/g, " "));
    }

    // Parse EXIF metadata for geotagged GPS coordinates
    try {
      const tags = await ExifReader.load(selectedFile);
      if (tags && tags.GPSLatitude && tags.GPSLongitude) {
        const latitude = tags.GPSLatitude.description;
        const longitude = tags.GPSLongitude.description;

        let latVal = typeof latitude === "number" ? latitude : parseFloat(String(latitude));
        let lngVal = typeof longitude === "number" ? longitude : parseFloat(String(longitude));

        if (!isNaN(latVal) && !isNaN(lngVal)) {
          // Double check references if needed (some cameras store absolute values and use Ref tags)
          if (tags.GPSLatitudeRef && String(tags.GPSLatitudeRef.value).toUpperCase().startsWith("S") && latVal > 0) {
            latVal = -latVal;
          }
          if (tags.GPSLongitudeRef && String(tags.GPSLongitudeRef.value).toUpperCase().startsWith("W") && lngVal > 0) {
            lngVal = -lngVal;
          }

          setLat(latVal.toFixed(6));
          setLng(lngVal.toFixed(6));
          setPendingCoords({ lat: latVal, lng: lngVal });
          setExifSuccessMsg("📍 Automatically extracted precise location from image EXIF geotags!");
        }
      }
    } catch (exifErr) {
      console.log("No EXIF metadata or GPS tags found in file:", exifErr);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Geolocation trigger
  const fetchCurrentLocation = () => {
    setGpsLoading(true);
    setError(null);
    
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setLat(latitude.toFixed(6));
        setLng(longitude.toFixed(6));
        setGpsLoading(false);
        setPendingCoords({ lat: latitude, lng: longitude });
      },
      (err) => {
        console.error("Geolocation error:", err);
        setError("Unable to retrieve your location. Try picking a spot on the map.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Reset form fields
  const resetForm = () => {
    setTitle("");
    setDescription("");
    setLat("");
    setLng("");
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
    clearPendingCoords();
  };

  // Form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Validations
    if (!file) {
      setError("Please select or drop an image file.");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a title for your photo.");
      return;
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      setError("Latitude must be a valid number between -90 and 90.");
      return;
    }

    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      setError("Longitude must be a valid number between -180 and 180.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("lat", latitude.toString());
      formData.append("lng", longitude.toString());

      const response = await fetch("/api/photos", {
        method: "POST",
        headers: {
          "x-username": username
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload photo to server.");
      }

      setSuccessMsg("Success! Photo stored securely in MongoDB via GridFS.");
      resetForm();
      onUploadSuccess();
      
      // Auto-hide success message after 5s
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error("Submission error:", err);
      setError(err.message || "An unexpected error occurred during upload.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-md p-5 flex flex-col gap-4 transition-all duration-300">
      
      <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-indigo-600" />
            <span>Upload New Photo</span>
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Store metadata & image binaries directly in GridFS.
          </p>
        </div>
        {file && (
          <button
            type="button"
            onClick={resetForm}
            className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold px-2 py-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 rounded-xl text-xs text-rose-700 dark:text-rose-400 font-medium">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-700 dark:text-emerald-400 font-medium animate-bounce">
          {successMsg}
        </div>
      )}
      {exifSuccessMsg && (
        <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-xl text-xs text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
          <span>{exifSuccessMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4.5">
        
        {/* Drag & Drop File Upload Area */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all ${
            previewUrl 
              ? "border-slate-300 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-950/10" 
              : dragActive
              ? "border-indigo-500 bg-indigo-50/40"
              : "border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-700 hover:bg-slate-50/30 dark:hover:bg-slate-950/20"
          }`}
          id="file-dropzone"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
            className="hidden"
          />

          {previewUrl ? (
            <div className="relative w-full flex flex-col items-center gap-2">
              <div className="relative w-full h-36 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
                <img
                  src={previewUrl}
                  alt="Upload Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setPreviewUrl(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-slate-950 text-white rounded-full transition"
                  title="Remove Image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-xs">
                {file?.name} ({(file!.size / (1024 * 1024)).toFixed(2)} MB)
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center py-2.5">
              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-2">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Drag & Drop Photo Here
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                or click to browse from files
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
            Photo Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Beautiful Lake Sunrise"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50 dark:bg-slate-950/40 text-slate-850 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
            required
            id="photo-title-input"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Description / Caption
          </label>
          <textarea
            placeholder="Describe where or what this is..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50 dark:bg-slate-950/40 h-16 resize-none text-slate-850 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500"
            id="photo-desc-input"
          />
        </div>

        {/* Coords Frame */}
        <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl p-3 flex flex-col gap-3 transition-colors duration-350">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              <span>Geo Location Coords <span className="text-rose-500">*</span></span>
            </span>
            <button
              type="button"
              onClick={fetchCurrentLocation}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 text-[11px] bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/60 px-3 py-1.5 rounded-lg font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
              id="gps-helper-btn"
            >
              {gpsLoading ? (
                <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
              ) : (
                <Navigation className="w-3 h-3 text-indigo-600" />
              )}
              <span>{gpsLoading ? "Locating..." : "Use My GPS"}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Latitude</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 28.6139"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  clearPendingCoords();
                }}
                className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
                id="lat-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Longitude</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 77.2090"
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value);
                  clearPendingCoords();
                }}
                className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
                id="lng-input"
              />
            </div>
          </div>

          {pendingCoords ? (
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 px-2.5 py-1 rounded flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Location captured from map click!</span>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex flex-col gap-1.5 bg-slate-100/50 dark:bg-slate-900/30 p-2.5 rounded-lg border border-slate-200/40 dark:border-slate-800/40">
              <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                <span>Need accurate photo geotagging?</span>
              </div>
              <ul className="text-[9.5px] leading-relaxed list-disc list-inside space-y-0.5 pl-1 text-slate-500 dark:text-slate-400">
                <li><strong className="text-indigo-600 dark:text-indigo-400">Upload Geotagged Photo:</strong> If your original photo has GPS tags, coordinates will be auto-extracted instantly!</li>
                <li><strong className="text-indigo-600 dark:text-indigo-400">Click on the Map:</strong> Tap any spot on the map to pin precise coordinate targets.</li>
                <li><strong className="text-indigo-600 dark:text-indigo-400">Use My GPS note:</strong> Browser GPS uses your internet router IP, which often defaults to central ISP hubs like Delhi.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed cursor-pointer"
          id="photo-submit-btn"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Image to GridFS...</span>
            </>
          ) : (
            <span>Publish and Tag on Map</span>
          )}
        </button>

      </form>
    </div>
  );
}
