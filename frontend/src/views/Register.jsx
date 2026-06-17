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
      navigate("/link-lastfm");
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

          <motion.div variants={fadeUp} className="space-y-3">
            <button
              type="button"
              onClick={() => { window.location.href = "/api/auth/google/login"; }}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Sign up with Google
            </button>

            <button
              type="button"
              onClick={() => { window.location.href = "/api/auth/discord/login"; }}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="20" height="15" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.9048 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C6.2057 11.9505 4.9438 18.7299 5.5539 25.4084C5.5596 25.4552 5.5871 25.4999 5.626 25.5264C8.5876 27.7385 11.3519 29.098 14.0603 30.0387C14.1265 30.0607 14.1967 30.0353 14.2372 29.9781C14.8745 29.1024 15.4501 28.1805 15.9545 27.2188C15.9983 27.1356 15.9375 27.0435 15.8474 27.0233C14.3538 26.5784 12.9324 26.0218 11.5489 25.3545C11.4442 25.3038 11.4228 25.1612 11.5061 25.0906C11.7632 24.8725 12.0172 24.6495 12.2636 24.4281C12.321 24.3782 12.4051 24.3632 12.4772 24.388C24.4213 29.7218 47.2365 29.7218 58.9758 24.388C59.0479 24.3632 59.132 24.3782 59.1894 24.4281C59.4358 24.6495 59.6871 24.8725 59.9468 25.0906C60.0301 25.1612 60.0115 25.3038 59.9068 25.3545C58.5233 26.0218 57.1019 26.5784 55.6083 27.0233C55.5182 27.0435 55.4601 27.1356 55.5039 27.2188C56.0083 28.1805 56.5813 29.1024 57.2186 29.9781C57.2591 30.0353 57.3293 30.0607 57.3955 30.0387C60.1039 29.098 62.8682 27.7385 65.8298 25.5264C65.8687 25.4999 65.8962 25.4552 65.9019 25.4084C66.6065 17.6735 64.7944 10.9498 60.1978 4.9795C60.1756 4.9429 60.1419 4.9147 60.1045 4.8978ZM23.7256 42.3268C20.2276 42.3268 17.3451 39.0814 17.3451 35.0732C17.3451 31.065 20.1717 27.8196 23.7256 27.8196C27.2795 27.8196 30.162 31.065 30.1061 35.0732C30.1061 39.0814 27.2795 42.3268 23.7256 42.3268ZM47.3178 42.3268C43.8198 42.3268 40.9373 39.0814 40.9373 35.0732C40.9373 31.065 43.7639 27.8196 47.3178 27.8196C50.8717 27.8196 53.7542 31.065 53.6983 35.0732C53.6983 39.0814 50.8717 42.3268 47.3178 42.3268Z" fill="white"/>
              </svg>
              Sign up with Discord
            </button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-neutral-800" />
              <span className="text-xs text-neutral-500">or</span>
              <div className="flex-1 h-px bg-neutral-800" />
            </div>
          </motion.div>

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
