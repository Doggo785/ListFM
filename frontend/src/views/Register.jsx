import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import {
  IconMail,
  IconLock,
  IconLoader2,
  IconAlertCircle,
} from "@tabler/icons-react";

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      await register(email, password);
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
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 pl-10 pr-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#ff530b]/50 focus:ring-1 focus:ring-[#ff530b]/20"
              />
            </div>
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
