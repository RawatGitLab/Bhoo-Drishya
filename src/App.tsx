import { useState, useEffect } from "react";
import InteractiveMap from "./components/InteractiveMap";
import UploadForm from "./components/UploadForm";
import PhotoGallery from "./components/PhotoGallery";
import AuthPage from "./components/AuthPage";
import { Photo, User } from "./types";
import { Compass, Database, ShieldCheck, MapPin, Loader2, AlertCircle, X, Calendar, ArrowLeft, LogOut, Sun, Moon, Users, Search, RefreshCw, Shield } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("drishya_theme");
    return (saved as "light" | "dark") || "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("drishya_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("drishya_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Admin-specific states
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [selectedTargetUser, setSelectedTargetUser] = useState<string | null>(null);
  const [isAdminSearchQuery, setIsAdminSearchQuery] = useState<string>("");
  const [isAdminLoadingUsers, setIsAdminLoadingUsers] = useState<boolean>(false);

  // Main states
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);

  // Deletion states
  const [isConfirmingDeleteAccount, setIsConfirmingDeleteAccount] = useState<boolean>(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  // Status states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dbStatus, setDbStatus] = useState<{ status: string; db: string; coll: string } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem("drishya_user", JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedTargetUser(null);
    setAdminUsers([]);
    localStorage.removeItem("drishya_user");
  };

  // Fetch registered user details (Admin only)
  const fetchAdminUsers = async () => {
    if (!currentUser || !currentUser.isAdmin) return;
    try {
      setIsAdminLoadingUsers(true);
      const res = await fetch("/api/admin/users", {
        headers: {
          "x-username": currentUser.username
        }
      });
      if (!res.ok) {
        throw new Error("Failed to fetch registered users.");
      }
      const data = await res.json();
      setAdminUsers(data.users || []);
    } catch (err: any) {
      console.error("Error fetching admin users:", err);
      setGlobalError("Could not retrieve registered users list.");
    } finally {
      setIsAdminLoadingUsers(false);
    }
  };

  // Handle Escape key to close big view lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewingPhoto(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 1. Fetch Database Health
  const checkDatabaseHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        setDbStatus({
          status: "connected",
          db: data.database,
          coll: data.collection
        });
      } else {
        setDbStatus({
          status: "failed",
          db: "Shapefile",
          coll: "photos"
        });
        setGlobalError("MongoDB is offline or misconfigured. Running in offline/fallback state.");
      }
    } catch (err) {
      console.error("Health check error:", err);
      setDbStatus({
        status: "failed",
        db: "Shapefile",
        coll: "photos"
      });
    }
  };

  // 2. Fetch Photos
  const fetchPhotos = async () => {
    if (!currentUser) return;
    try {
      setIsLoading(true);
      const headers: any = {
        "x-username": currentUser.username
      };
      if (currentUser.isAdmin && selectedTargetUser) {
        headers["x-target-user"] = selectedTargetUser;
      }
      
      const queryParams = currentUser.isAdmin && selectedTargetUser ? `?targetUser=${selectedTargetUser}` : "";
      const res = await fetch(`/api/photos${queryParams}`, { headers });
      
      if (!res.ok) {
        throw new Error("Failed to load photo metadata.");
      }
      const data = await res.json();
      setPhotos(data.photos || []);
      setGlobalError(null);
    } catch (err: any) {
      console.error("Error fetching photos:", err);
      setGlobalError("Could not retrieve photos. Please verify server connectivity.");
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Delete Photo
  const handleDeletePhoto = async (id: string) => {
    if (!currentUser) return;
    try {
      const headers: any = {
        "x-username": currentUser.username
      };
      if (currentUser.isAdmin && selectedTargetUser) {
        headers["x-target-user"] = selectedTargetUser;
      }

      const queryParams = currentUser.isAdmin && selectedTargetUser ? `?targetUser=${selectedTargetUser}` : "";
      const res = await fetch(`/api/photos/${id}${queryParams}`, {
        method: "DELETE",
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete photo from GridFS.");
      }
      // Success: clean selected state if the deleted photo was active
      if (selectedPhoto?.id === id) {
        setSelectedPhoto(null);
      }
      // Refresh list
      await fetchPhotos();
      
      // Update admin user count
      if (currentUser.isAdmin) {
        fetchAdminUsers();
      }
    } catch (err: any) {
      console.error("Error deleting photo:", err);
      setGlobalError(err.message || "An error occurred during photo deletion.");
      // Automatically clear after 5 seconds
      setTimeout(() => {
        setGlobalError(null);
      }, 5000);
    }
  };

  // 4. Handle map click to stage a photo placement
  const handleMapClick = (lat: number, lng: number) => {
    setPendingCoords({ lat, lng });
    // Clear selected photo so user can focus on the placement
    setSelectedPhoto(null);
  };

  // 5. Delete Account and Auto-drop collections
  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    try {
      setIsDeletingAccount(true);
      const res = await fetch("/api/auth/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: currentUser.username })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account.");
      }
      // Successful deletion - log out and reset states
      setIsConfirmingDeleteAccount(false);
      handleLogout();
    } catch (err: any) {
      console.error("Error deleting account:", err);
      setGlobalError(err.message || "An error occurred during account deletion.");
      setTimeout(() => setGlobalError(null), 5000);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Initial load
  useEffect(() => {
    checkDatabaseHealth();
  }, []);

  // Fetch photos on user or target selection change
  useEffect(() => {
    if (currentUser) {
      fetchPhotos();
    }
  }, [currentUser, selectedTargetUser]);

  // Fetch admin user profiles list on login / mount
  useEffect(() => {
    if (currentUser && currentUser.isAdmin) {
      fetchAdminUsers();
    }
  }, [currentUser]);

  if (!currentUser) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} theme={theme} toggleTheme={toggleTheme} />;
  }

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans text-slate-800 dark:text-slate-200 antialiased selection:bg-indigo-500/10 selection:text-indigo-900 overflow-hidden transition-colors duration-300">
      
      {/* Dynamic Grid Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 shadow-sm px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50 flex-shrink-0 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/10">
            <Compass className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-display tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <span>{currentUser ? `Bhoo-Drishya ${currentUser.username}` : "Bhoo-Drishya-App"}</span>
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/60 font-mono">
                GridFS v1.0
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-none mt-1">
              Store geogrphical informaition from field & visualize dynamically on multiple base maps.
            </p>
          </div>
        </div>

        {/* Status indicator bar */}
        <div className="flex items-center gap-3 flex-wrap justify-end">
          
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            type="button"
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-750 transition duration-200 cursor-pointer active:scale-95 flex items-center justify-center"
            id="main-theme-toggle-btn"
            title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* MongoDB Connection Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs transition-colors duration-300">
            <Database className="w-4 h-4 text-slate-500" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-none uppercase">
                {currentUser ? "Logged In User" : "Database Status"}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${
                  currentUser ? "bg-indigo-500 animate-pulse" : (dbStatus?.status === "connected" ? "bg-emerald-500" : "bg-rose-500 animate-pulse")
                }`} />
                <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                  {currentUser ? `Drishya ${currentUser.username}` : (dbStatus?.status === "connected" ? `${dbStatus.db}.${dbStatus.coll}` : "Connecting...")}
                </span>
              </div>
            </div>
          </div>

          {/* Secure Rules Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs transition-colors duration-300">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-none uppercase font-semibold">GridFS Rules</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px] mt-0.5">Strict Isolation</span>
            </div>
          </div>

          {/* Logout Button */}
          {currentUser && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200 dark:border-rose-900/40 text-xs font-bold transition duration-200 cursor-pointer active:scale-95"
              id="logout-btn"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}

          {/* Delete Account Button */}
          {currentUser && (
            <button
              onClick={() => setIsConfirmingDeleteAccount(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition duration-200 cursor-pointer active:scale-95 shadow-sm shadow-rose-600/10"
              id="delete-account-btn"
              title="Delete Account & Drop Photo collections"
            >
              <X className="w-3.5 h-3.5" />
              <span>Delete Account</span>
            </button>
          )}

        </div>
      </header>

      {/* Main Body Layout */}
      <main className="flex-1 p-6 flex flex-col xl:flex-row gap-6 overflow-hidden min-h-0">
        
        {/* Left column: Controls & Upload */}
        <div className="w-full xl:w-[450px] flex flex-col gap-6 h-full overflow-y-auto pr-1.5 flex-shrink-0">
          
          {/* Admin panel / Upload form */}
          <div className="flex-shrink-0">
            {currentUser.isAdmin && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-md p-5 flex flex-col gap-4 mb-4 transition-all duration-300">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Admin Control Center</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Monitor user profiles and their uploaded geotagged data.
                    </p>
                  </div>
                  <button
                    onClick={fetchAdminUsers}
                    disabled={isAdminLoadingUsers}
                    className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                    title="Refresh user profiles list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAdminLoadingUsers ? "animate-spin text-indigo-500" : ""}`} />
                  </button>
                </div>

                {/* Total Stats Banner */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 p-3 rounded-xl">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono uppercase font-semibold block leading-none">Registered Users</span>
                    <span className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1 block font-display">
                      {adminUsers.length}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 p-3 rounded-xl">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono uppercase font-semibold block leading-none">Total Photos Tagged</span>
                    <span className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1 block font-display">
                      {adminUsers.reduce((sum, u) => sum + (u.photoCount || 0), 0)}
                    </span>
                  </div>
                </div>

                {/* Search Profiles */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search profiles by username or email..."
                    value={isAdminSearchQuery}
                    onChange={(e) => setIsAdminSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1.5 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition"
                  />
                </div>

                {/* Users List */}
                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                  {isAdminLoadingUsers && adminUsers.length === 0 ? (
                    <div className="text-center py-4 flex flex-col items-center justify-center">
                      <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Loading profiles...</span>
                    </div>
                  ) : adminUsers.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400 italic">
                      No user accounts created yet.
                    </div>
                  ) : (
                    adminUsers
                      .filter(u => {
                        const query = isAdminSearchQuery.toLowerCase();
                        return u.username.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
                      })
                      .map(u => {
                        const isActive = selectedTargetUser === u.username;
                        return (
                          <div
                            key={u.id}
                            onClick={() => {
                              setSelectedTargetUser(isActive ? null : u.username);
                              setSelectedPhoto(null);
                            }}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 text-left ${
                              isActive
                                ? "border-indigo-500 bg-indigo-50/55 dark:bg-indigo-950/45 text-indigo-950 dark:text-indigo-200 ring-2 ring-indigo-500/10"
                                : "border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 hover:border-slate-200 dark:hover:border-slate-700"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs truncate">@{u.username}</span>
                                <span className="text-[8.5px] bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-semibold font-mono">
                                  {u.photoCount || 0} {u.photoCount === 1 ? "photo" : "photos"}
                                </span>
                              </div>
                              <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block truncate">{u.email}</span>
                              <span className="text-[8px] text-slate-400 dark:text-slate-500 block">
                                Joined: {new Date(u.createdAt).toLocaleDateString()}
                              </span>
                            </div>

                            {/* View selection indicator */}
                            <div className={`px-2 py-1 rounded-lg text-[9px] font-bold ${
                              isActive 
                                ? "bg-indigo-600 text-white" 
                                : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                            }`}>
                              {isActive ? "Active View" : "View Surveys"}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}

            {currentUser.isAdmin && selectedTargetUser ? (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4.5 rounded-2xl text-xs flex flex-col gap-2 mb-4 transition-colors">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span>Viewing Geotagged Surveys of @{selectedTargetUser}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  As an administrator, you are currently inspecting photos, coordinates, and metadata uploaded by <strong>@{selectedTargetUser}</strong>. Standard file upload is disabled during active user survey views.
                </p>
                <button
                  onClick={() => {
                    setSelectedTargetUser(null);
                    setSelectedPhoto(null);
                  }}
                  className="w-full mt-1.5 py-2 px-3 bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 rounded-xl font-bold text-xs transition active:scale-[0.98] cursor-pointer text-center text-amber-700 dark:text-amber-300"
                >
                  Clear Selection & Return to Admin Profile
                </button>
              </div>
            ) : (
              <UploadForm
                onUploadSuccess={fetchPhotos}
                pendingCoords={pendingCoords}
                setPendingCoords={setPendingCoords}
                clearPendingCoords={() => setPendingCoords(null)}
                username={currentUser.username}
              />
            )}
          </div>

          {/* Photo list Gallery index */}
          <div>
            {isLoading ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-12 text-center flex flex-col items-center justify-center shadow-md">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Loading Geotagged Database...</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Retrieving image coordinates & metadata from MongoDB GridFS files...</p>
              </div>
            ) : (
              <PhotoGallery
                photos={photos}
                selectedPhoto={selectedPhoto}
                onSelectPhoto={setSelectedPhoto}
                onDeletePhoto={handleDeletePhoto}
                onViewPhoto={setViewingPhoto}
                username={currentUser.isAdmin && selectedTargetUser ? selectedTargetUser : currentUser.username}
              />
            )}
          </div>
        </div>

        {/* Right column: Immersive Leaflet Map */}
        <div className="flex-1 h-[400px] xl:h-auto min-h-0 relative">
          
          {globalError && (
            <div className="absolute top-16 left-4 right-4 z-50 p-3 bg-rose-500/95 backdrop-blur text-white text-xs font-semibold rounded-xl shadow-xl flex items-center gap-2.5 border border-rose-600">
              <AlertCircle className="w-4 h-4" />
              <span>{globalError}</span>
            </div>
          )}

          <InteractiveMap
            photos={photos}
            selectedPhoto={selectedPhoto}
            onMapClick={handleMapClick}
            pendingCoords={pendingCoords}
            onDeletePhoto={handleDeletePhoto}
            onSelectPhoto={setSelectedPhoto}
            onViewPhoto={setViewingPhoto}
            username={currentUser.isAdmin && selectedTargetUser ? selectedTargetUser : currentUser.username}
            theme={theme}
          />
        </div>

      </main>

      {/* Immersive Photo Fullscreen Lightbox / Big View */}
      <AnimatePresence>
        {viewingPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-8 overflow-y-auto"
            onClick={() => setViewingPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden max-w-5xl w-full shadow-2xl flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image Section */}
              <div className="flex-1 bg-slate-950 flex items-center justify-center relative p-4 min-h-[300px] md:min-h-[500px]">
                <img
                  src={`/api/photos/${viewingPhoto.id}?username=${currentUser.username}${currentUser.isAdmin && selectedTargetUser ? `&targetUser=${selectedTargetUser}` : ""}`}
                  alt={viewingPhoto.metadata.title}
                  className="max-h-[50vh] md:max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
                  referrerPolicy="no-referrer"
                />
                
                {/* Float indicator */}
                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-2.5 py-1 rounded-lg text-[10px] font-mono text-slate-400">
                  {(viewingPhoto.length / (1024 * 1024)).toFixed(2)} MB • {viewingPhoto.contentType}
                </div>
              </div>

              {/* Sidebar Info Section */}
              <div className="w-full md:w-[350px] bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 p-6 flex flex-col justify-between gap-6">
                
                {/* Header & Meta */}
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                        Geotagged Photo
                      </span>
                      <h2 className="text-xl font-bold font-display text-white mt-2 leading-tight truncate">
                        {viewingPhoto.metadata.title}
                      </h2>
                    </div>
                    {/* Return/Close Button */}
                    <button
                      onClick={() => setViewingPhoto(null)}
                      className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-xl transition-all cursor-pointer shadow-md flex-shrink-0"
                      title="Close"
                      id="close-lightbox-btn"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-sm text-slate-400 leading-relaxed italic bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 max-h-[120px] overflow-y-auto">
                    {viewingPhoto.metadata.description || "No description provided."}
                  </p>

                  {/* GPS Coordinates panel */}
                  <div className="flex flex-col gap-2.5 bg-slate-950/80 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                      <MapPin className="w-4 h-4" />
                      <span>GPS Meta Location</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-900 p-2 rounded border border-slate-800/40">
                        <span className="text-[10px] text-slate-500 uppercase block">Latitude</span>
                        <span className="text-slate-300 font-bold">{viewingPhoto.metadata.lat.toFixed(6)}</span>
                      </div>
                      <div className="bg-slate-900 p-2 rounded border border-slate-800/40">
                        <span className="text-[10px] text-slate-500 uppercase block">Longitude</span>
                        <span className="text-slate-300 font-bold">{viewingPhoto.metadata.lng.toFixed(6)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Date details */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-medium px-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Uploaded: {new Date(viewingPhoto.uploadDate).toLocaleString()}</span>
                  </div>
                </div>

                {/* Return to Map & Zoom Actions */}
                <div className="flex flex-col gap-2 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => {
                      // Center map on photo location and select it
                      setSelectedPhoto(viewingPhoto);
                      setViewingPhoto(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-4 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Compass className="w-4 h-4" />
                    <span>Show on Interactive Map</span>
                  </button>
                  
                  <button
                    onClick={() => setViewingPhoto(null)}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-4 rounded-xl font-semibold text-xs transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to Gallery</span>
                  </button>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {isConfirmingDeleteAccount && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-4"
            onClick={() => setIsConfirmingDeleteAccount(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 text-center transition-colors duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="w-6 h-6 animate-bounce" />
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display">
                Delete Account Automatically?
              </h3>
              
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Warning: Deleting your account <span className="font-bold text-slate-700 dark:text-slate-300">@{currentUser.username}</span> will completely and permanently delete your login and automatically drop your associated photo database collections (<span className="font-semibold font-mono">{currentUser.username}.files</span> and <span className="font-semibold font-mono">{currentUser.username}.chunks</span>) containing all your uploaded images.
              </p>

              <div className="flex flex-col gap-2 mt-2">
                <button
                  disabled={isDeletingAccount}
                  onClick={handleDeleteAccount}
                  className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isDeletingAccount ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting & Dropping Collections...</span>
                    </>
                  ) : (
                    <span>Yes, Delete Account & Dropping Collections</span>
                  )}
                </button>
                <button
                  disabled={isDeletingAccount}
                  onClick={() => setIsConfirmingDeleteAccount(false)}
                  className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 py-2 rounded-xl font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
