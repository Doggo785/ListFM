import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import Grainient from "../components/ui/Grainient";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Login - ListFM";
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-page__bg">
        <Grainient
          color1="#FF6817"
          color2="#17AEFF"
          color3="#1c191c"
          timeSpeed={0.2}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={1.5}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.06}
          grainScale={2}
          grainAnimated={false}
          contrast={1.2}
          gamma={1}
          saturation={0.8}
          centerX={0}
          centerY={0}
          zoom={1}
        />
      </div>

      <div className="login-page__content">
        <motion.div
          className="login-page__hero"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link
            to="/"
            className="login-page__brand hover:opacity-80 transition-opacity inline-block"
          >
            ListFM
          </Link>
          <p className="login-page__tagline">Welcome back</p>
        </motion.div>

        <motion.form
          className="login-page__form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {error && (
            <motion.div
              className="login-page__error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {error}
            </motion.div>
          )}

          <div className="login-page__oauth-group">
            <button
              type="button"
              onClick={() => { window.location.href = "/api/auth/google/login"; }}
              className="login-page__button login-page__button--google"
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>

            <button
              type="button"
              onClick={() => { window.location.href = "/api/auth/discord/login"; }}
              className="login-page__button login-page__button--discord"
              disabled={loading}
            >
              <svg width="20" height="15" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.9048 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C6.2057 11.9505 4.9438 18.7299 5.5539 25.4084C5.5596 25.4552 5.5871 25.4999 5.626 25.5264C8.5876 27.7385 11.3519 29.098 14.0603 30.0387C14.1265 30.0607 14.1967 30.0353 14.2372 29.9781C14.8745 29.1024 15.4501 28.1805 15.9545 27.2188C15.9983 27.1356 15.9375 27.0435 15.8474 27.0233C14.3538 26.5784 12.9324 26.0218 11.5489 25.3545C11.4442 25.3038 11.4228 25.1612 11.5061 25.0906C11.7632 24.8725 12.0172 24.6495 12.2636 24.4281C12.321 24.3782 12.4051 24.3632 12.4772 24.388C24.4213 29.7218 47.2365 29.7218 58.9758 24.388C59.0479 24.3632 59.132 24.3782 59.1894 24.4281C59.4358 24.6495 59.6871 24.8725 59.9468 25.0906C60.0301 25.1612 60.0115 25.3038 59.9068 25.3545C58.5233 26.0218 57.1019 26.5784 55.6083 27.0233C55.5182 27.0435 55.4601 27.1356 55.5039 27.2188C56.0083 28.1805 56.5813 29.1024 57.2186 29.9781C57.2591 30.0353 57.3293 30.0607 57.3955 30.0387C60.1039 29.098 62.8682 27.7385 65.8298 25.5264C65.8687 25.4999 65.8962 25.4552 65.9019 25.4084C66.6065 17.6735 64.7944 10.9498 60.1978 4.9795C60.1756 4.9429 60.1419 4.9147 60.1045 4.8978ZM23.7256 42.3268C20.2276 42.3268 17.3451 39.0814 17.3451 35.0732C17.3451 31.065 20.1717 27.8196 23.7256 27.8196C27.2795 27.8196 30.162 31.065 30.1061 35.0732C30.1061 39.0814 27.2795 42.3268 23.7256 42.3268ZM47.3178 42.3268C43.8198 42.3268 40.9373 39.0814 40.9373 35.0732C40.9373 31.065 43.7639 27.8196 47.3178 27.8196C50.8717 27.8196 53.7542 31.065 53.6983 35.0732C53.6983 39.0814 50.8717 42.3268 47.3178 42.3268Z" fill="white"/>
              </svg>
              Sign in with Discord
            </button>
          </div>

          <div className="login-page__divider">
            <span>or</span>
          </div>

          <div className="login-page__field">
            <label htmlFor="email" className="login-page__label">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="login-page__input"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="login-page__field">
            <label htmlFor="password" className="login-page__label">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="login-page__input pr-10"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-page__button"
            disabled={loading}
          >
            {loading ? (
              <span className="login-page__button-loading">
                <span className="login-page__spinner" />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>
        </motion.form>

        <motion.div
          className="login-page__footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <p className="login-page__hint">
            Don't have an account?{" "}
            <Link to="/register" className="login-page__link">
              Create one
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}

export default Login;
