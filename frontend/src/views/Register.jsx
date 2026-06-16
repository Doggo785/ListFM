import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import {
  IconMail,
  IconLock,
  IconLoader2,
  IconAlertCircle,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";

const getPasswordStrength = (password) => {
  if (!password) return { score: 0, label: "", color: "" };
  
  let score = 0;
  
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  
  const normalizedScore = Math.min(Math.round((score / 6) * 100), 100);
  
  if (normalizedScore < 25) return { score: normalizedScore, label: "Weak", color: "#ef4444" };
  if (normalizedScore < 50) return { score: normalizedScore, label: "Fair", color: "#f97316" };
  if (normalizedScore < 75) return { score: normalizedScore, label: "Good", color: "#eab308" };
  return { score: normalizedScore, label: "Strong", color: "#22c55e" };
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

function validateEmail(value) {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(value);
}

function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    document.title = "Register - ListFM";
  }, []);

  function validate() {
    if (!email.trim()) return "Email is required";
    if (!validateEmail(email)) return "Please enter a valid email address";
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await register(email, password, displayName);
      navigate("/");
    } catch (err) {
      const msg = err?.message || "";
      if (msg.includes("409") || msg.toLowerCase().includes("already")) {
        setError("An account with this email already exists");
      } else if (msg.includes("422")) {
        setError("Invalid input. Please check your details");
      } else {
        setError("Something went wrong. Please try again");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-[#121212] min-h-screen px-4">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm space-y-8"
      >
        <motion.header variants={fadeUp} className="text-center">
          <Link
            to="/"
            className="inline-block mb-4 text-3xl font-black text-[#ff530b] hover:opacity-80 transition-opacity"
          >
            ListFM
          </Link>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Create your account
          </h1>
          <p className="text-neutral-500 text-sm mt-2">
            Join ListFM to build automated playlists
          </p>
        </motion.header>

        <motion.form
          variants={fadeUp}
          onSubmit={handleSubmit}
          className="space-y-4"
          noValidate
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
            >
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <motion.div variants={fadeUp} className="space-y-1.5">
            <label
              htmlFor="register-email"
              className="block text-xs font-medium text-neutral-400 uppercase tracking-wider"
            >
              Email
            </label>
            <div className="relative">
              <IconMail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              />
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#ff530b]/50 focus:ring-1 focus:ring-[#ff530b]/20"
              />
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="space-y-1.5">
            <label
              htmlFor="register-display-name"
              className="block text-xs font-medium text-neutral-400 uppercase tracking-wider"
            >
              Display name
            </label>
            <div className="relative">
              <IconMail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              />
              <input
                id="register-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional"
                autoComplete="name"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#ff530b]/50 focus:ring-1 focus:ring-[#ff530b]/20"
              />
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="space-y-1.5">
            <label
              htmlFor="register-password"
              className="block text-xs font-medium text-neutral-400 uppercase tracking-wider"
            >
              Password
            </label>
            <div className="relative">
              <IconLock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              />
              <input
                id="register-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 pl-10 pr-10 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#ff530b]/50 focus:ring-1 focus:ring-[#ff530b]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
            
            <AnimatePresence>
              {password.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-neutral-500">Password strength</span>
                      <motion.span
                        key={passwordStrength.label}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs font-medium"
                        style={{ color: passwordStrength.color }}
                      >
                        {passwordStrength.label}
                      </motion.span>
                    </div>
                    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${passwordStrength.score}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: passwordStrength.color }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div variants={fadeUp} className="space-y-1.5">
            <label
              htmlFor="register-confirm-password"
              className="block text-xs font-medium text-neutral-400 uppercase tracking-wider"
            >
              Confirm password
            </label>
            <div className="relative">
              <IconLock
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600"
              />
              <input
                id="register-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#ff530b]/50 focus:ring-1 focus:ring-[#ff530b]/20"
              />
            </div>
          </motion.div>

          <motion.div variants={fadeUp} className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#ff530b] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#ff530b]/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <IconLoader2 size={16} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create account"
              )}
            </button>
          </motion.div>
        </motion.form>

        <motion.p
          variants={fadeUp}
          className="text-center text-sm text-neutral-500"
        >
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[#17AEFF] hover:text-[#17AEFF]/80 transition-colors font-medium"
          >
            Sign in
          </Link>
        </motion.p>
      </motion.div>
    </main>
  );
}

export default Register;
