import React, { useState, useEffect } from "react";
import { User } from "../types";
import { Compass, Lock, Mail, User as UserIcon, Loader2, AlertCircle, CheckCircle, Eye, EyeOff, Shield, ArrowLeft, KeyRound, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AuthPageProps {
  onLoginSuccess: (user: User) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export default function AuthPage({ onLoginSuccess, theme, toggleTheme }: AuthPageProps) {
  const [authMode, setAuthMode] = useState<"login" | "signup" | "forgot" | "reset">("login");
  
  // Helper derived states to preserve maximum compatibility
  const isLogin = authMode === "login";
  const isSignup = authMode === "signup";
  const isForgot = authMode === "forgot";
  const isReset = authMode === "reset";
  
  // Input fields
  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  
  // UI states
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Password Recovery States
  const [recoveryEmail, setRecoveryEmail] = useState<string>("");
  const [demoResetCode, setDemoResetCode] = useState<string | null>(null);

  const resetForm = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setVerificationCode("");
    setError(null);
    setSuccess(null);
  };

  const handleToggleMode = (mode: "login" | "signup") => {
    setAuthMode(mode);
    resetForm();
    setDemoResetCode(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (isForgot) {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Email Address is required.");
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to process request.");
        }

        setRecoveryEmail(trimmedEmail);
        
        if (data.devMode && data.code) {
          setDemoResetCode(data.code);
          setSuccess(`Code generated! ${data.message}`);
        } else {
          setSuccess(data.message);
        }

        setTimeout(() => {
          setAuthMode("reset");
          setError(null);
          setSuccess(null);
        }, 1500);

      } catch (err: any) {
        setError(err.message || "An error occurred.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (isReset) {
      const trimmedEmail = recoveryEmail.trim();
      const trimmedCode = verificationCode.trim();
      if (!trimmedEmail) {
        setError("Email is missing. Please start over.");
        return;
      }
      if (!trimmedCode) {
        setError("Verification code is required.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmedEmail, code: trimmedCode, newPassword: password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to reset password.");
        }

        setSuccess("Password reset successful! Redirecting to Sign In...");
        setDemoResetCode(null);
        setTimeout(() => {
          setAuthMode("login");
          resetForm();
          setUsername(trimmedEmail); // prefill with email/username
        }, 2000);

      } catch (err: any) {
        setError(err.message || "An error occurred.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Validation for normal login/signup
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Username or Email is required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (isSignup) {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Email is required.");
        return;
      }
      if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
        setError("Please provide a valid email address.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        // Log in
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmedUsername, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to log in.");
        }

        setSuccess("Login successful! Redirecting...");
        setTimeout(() => {
          onLoginSuccess(data.user);
        }, 800);
      } else {
        // Sign up
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: trimmedUsername, email, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to sign up.");
        }

        setSuccess("Account created successfully! Switching to Login...");
        setTimeout(() => {
          setAuthMode("login");
          resetForm();
          // Pre-populate username
          setUsername(trimmedUsername);
        }, 1500);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      
      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={toggleTheme}
          type="button"
          className="p-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-md hover:shadow-lg dark:shadow-none hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
          id="theme-toggle-btn"
          title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
        >
          {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
      </div>
      
      {/* Decorative background gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-white dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl dark:shadow-2xl relative z-10 transition-all duration-300"
        id="auth-card"
      >
        {/* Brand logo/title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 mb-4">
            <Compass className="w-6 h-6 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Bhoo-Drishya-App
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 text-center leading-relaxed">
            Geotagged photographic survey and dynamic mapping platform.
          </p>
        </div>

        {/* Tab Selector or Header depending on mode */}
        {isLogin || isSignup ? (
          <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl mb-8 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => handleToggleMode("login")}
              className={`py-2 px-4 rounded-xl font-semibold text-xs transition-all relative ${
                isLogin ? "text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              id="tab-login"
            >
              {isLogin && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 bg-indigo-600 rounded-xl"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">Sign In</span>
            </button>
            
            <button
              onClick={() => handleToggleMode("signup")}
              className={`py-2 px-4 rounded-xl font-semibold text-xs transition-all relative ${
                !isLogin ? "text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              id="tab-signup"
            >
              {!isLogin && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 bg-indigo-600 rounded-xl"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">Create Account</span>
            </button>
          </div>
        ) : (
          <div className="mb-8">
            <button
              onClick={() => {
                setAuthMode("login");
                resetForm();
                setDemoResetCode(null);
              }}
              className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer mb-3"
              id="back-to-login"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Login</span>
            </button>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">
              {isForgot ? "Recover Password" : "Set New Password"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isForgot 
                ? "Enter your email to receive a password reset verification code." 
                : `Enter the code sent to ${recoveryEmail} and set your new password.`
              }
            </p>
          </div>
        )}

        {/* Demo/Dev Mode Reset Code Alert */}
        {demoResetCode && (isForgot || isReset) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3.5 rounded-xl text-xs flex flex-col gap-1.5 mb-6 text-center"
          >
            <div className="flex items-center justify-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
              <span>Demo Reset Code</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              Since SMTP is not configured in secrets, we logged your verification code to the server console:
            </p>
            <div className="font-mono bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 tracking-widest inline-block mx-auto mt-1 select-all">
              {demoResetCode}
            </div>
          </motion.div>
        )}

        {/* Info/Errors block */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 p-3.5 rounded-xl text-xs flex items-start gap-2.5 mb-6"
              id="auth-error-alert"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-xl text-xs flex items-start gap-2.5 mb-6"
              id="auth-success-alert"
            >
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Forms */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Username / Email field */}
          {(isLogin || isSignup) && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                {isLogin ? "Username or Email" : "Username"}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={isLogin ? "Enter username or email" : "Choose username"}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none transition"
                  required
                  id="auth-username"
                />
              </div>
            </div>
          )}

          {/* Email field (Sign Up & Forgot Password Only) */}
          {(isSignup || isForgot) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-1.5"
            >
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none transition"
                  required
                  id="auth-email"
                />
              </div>
            </motion.div>
          )}

          {/* Verification Code field (Reset Password Only) */}
          {isReset && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-1.5"
            >
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                6-Digit Verification Code
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none tracking-[0.25em] font-mono text-center transition"
                  required
                  id="auth-verification-code"
                />
              </div>
            </motion.div>
          )}

          {/* Password field */}
          {(isLogin || isSignup || isReset) && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                  {isReset ? "New Password" : "Password"}
                </label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("forgot");
                      resetForm();
                      setDemoResetCode(null);
                    }}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium cursor-pointer transition hover:underline"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none transition"
                  required
                  id="auth-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Confirm Password (Sign Up & Reset Only) */}
          {(isSignup || isReset) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-1.5"
            >
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-semibold">
                {isReset ? "Confirm New Password" : "Confirm Password"}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none transition"
                  required
                  id="auth-confirm-password"
                />
              </div>
            </motion.div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold text-sm py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/25 transition-all cursor-pointer active:scale-[0.98] mt-6"
            id="auth-submit-btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {isLogin && "Signing in..."}
                  {isSignup && "Creating account..."}
                  {isForgot && "Sending..."}
                  {isReset && "Resetting password..."}
                </span>
              </>
            ) : (
              <span>
                {isLogin && "Sign In"}
                {isSignup && "Create Account"}
                {isForgot && "Send Verification Code"}
                {isReset && "Reset Password"}
              </span>
            )}
          </button>
        </form>

        {/* Security / DB badge footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
          <span>Secured with MongoDB Cluster0</span>
        </div>
      </motion.div>
    </div>
  );
}
