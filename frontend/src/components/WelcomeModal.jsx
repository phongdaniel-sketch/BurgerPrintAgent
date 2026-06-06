import { motion } from 'framer-motion';
import { useTranslation } from '../i18n';


function WelcomeModal({ onGoogleLogin, onEmailLogin, onGuestChat, email, setEmail, password, setPassword }) {
  const { t } = useTranslation();
  const endpoint = import.meta.env.VITE_ENDPOINT || '';

  return (
    <motion.div
      className="modal-backdrop fixed inset-0 flex items-center justify-center p-6 z-50"
      style={{ background: 'var(--bg-modal-overlay)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="modal-card rounded-2xl w-full max-w-md p-8 shadow-2xl"
        initial={{ scale: 0.96, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 20, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="text-2xl font-semibold mb-6 text-center" style={{ color: 'var(--text-primary)' }}>
          {t('modal.welcome')}
        </h2>
        {/* Endpoint (read-only) */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">{t('modal.endpoint')}</label>
          <input
            type="text"
            readOnly
            value={endpoint}
            className="block w-full px-3 py-2 rounded-md text-sm"
          />
        </div>
        {/* Email */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">{t('modal.email')}</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="block w-full px-3 py-2 rounded-md text-sm"
          />
        </div>
        {/* Password */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">{t('modal.password')}</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="block w-full px-3 py-2 rounded-md text-sm"
          />
        </div>
        {/* Login with email/password */}
        <button
          className="w-full py-3 mb-3 rounded-xl font-semibold transition-colors text-white"
          style={{ background: 'var(--accent)' }}
          onClick={onEmailLogin}
        >
          {t('modal.login')}
        </button>
        {/* Divider */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border-medium)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('modal.or')}</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border-medium)' }} />
        </div>
        <button
          className="flex items-center justify-center w-full py-3 mb-3 border rounded-xl transition-colors"
          style={{ borderColor: 'var(--border-medium)', background: 'transparent', color: 'var(--text-primary)' }}
          onClick={onGoogleLogin}
        >
          <svg className="w-5 h-5 mr-2" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M533.5 278.4c0-17.5-1.5-34.4-4.3-50.7H272v95.9h146.9c-6.4 34.5-25.5 63.8-54.2 83.4v68h87.5c51.2-47.2 80.8-116.9 80.8-196.6" />
            <path fill="#34A853" d="M272 544.3c73.2 0 134.7-24.2 179.5-66.1l-87.5-68c-24.3 16.3-55.3 26-92 26-70.8 0-130.9-47.7-152.5-111.9h-90v70.2c44.8 88.4 136.9 149.8 242.5 149.8" />
            <path fill="#FBBC04" d="M119.5 324.3c-10-30-10-62.5 0-92.5v-70.2h-90c-39.2 77.5-39.2 166.9 0 244.4l90-81.7" />
            <path fill="#EA4335" d="M272 107.5c39.8-.6 78.2 14.9 107.4 43.1l80.5-80.5C418.6 22.5 346.5-2.1 272 0 166.4 0 73.3 61.4 28.5 149.8l90 81.7C141.2 155.2 201.2 107.5 272 107.5" />
          </svg>
          {t('modal.googleLogin')}
        </button>
        <button
          className="w-full py-3 border rounded-xl transition-colors"
          style={{ borderColor: 'var(--border-medium)', background: 'transparent', color: 'var(--text-secondary)' }}
          onClick={onGuestChat}
        >
          {t('modal.guestChat')}
        </button>
      </motion.div>
    </motion.div>
  );
}

export default WelcomeModal;
