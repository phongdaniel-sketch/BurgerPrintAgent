import { motion, AnimatePresence } from 'framer-motion';
import {
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquarePlus,
  MessagesSquare,
  Globe,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { useTranslation } from '../i18n';

export default function Sidebar({
  collapsed,
  onToggle,
  onNewChat,
  onLogout,
  userName,
  userEmail,
  theme,
  onToggleTheme,
}) {
  const { t, locale, setLocale } = useTranslation();

  const items = [
    { icon: MessageSquarePlus, label: t('sidebar.newChat'), action: onNewChat },
    { icon: MessagesSquare, label: t('sidebar.history'), action: null },
  ];

  return (
    <motion.aside
      className="sidebar"
      animate={{ width: collapsed ? 0 : 260 }}
      transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="sidebar-inner" style={{ width: 260 }}>
        {/* Header */}
        <div className="sidebar-header">
          <img src="./favicon.png" alt="" className="sidebar-brand-icon" />
          <span className="sidebar-brand-text">BurgerPrint Agent</span>
          <button
            className="sidebar-toggle"
            onClick={onToggle}
            title={t('sidebar.collapse')}
          >
            <PanelLeftClose size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {items.map((item, i) => (
            <button
              key={i}
              className="sidebar-item"
              onClick={item.action || undefined}
              disabled={!item.action}
            >
              <item.icon size={19} strokeWidth={1.8} className="sidebar-item-icon" />
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Spacer */}
        <div className="sidebar-spacer" />

        {/* Bottom actions: Theme + Language */}
        <div className="sidebar-bottom-actions">
          {/* Theme toggle */}
          <button
            className="sidebar-item"
            onClick={onToggleTheme}
            title={t('theme.label')}
          >
            {theme === 'dark' ? (
              <Sun size={19} strokeWidth={1.8} className="sidebar-item-icon" />
            ) : (
              <Moon size={19} strokeWidth={1.8} className="sidebar-item-icon" />
            )}
            <span className="sidebar-item-label">
              {theme === 'dark' ? t('theme.light') : t('theme.dark')}
            </span>
          </button>

          {/* Language toggle */}
          <button
            className="sidebar-item"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
            title={t('lang.label')}
          >
            <Globe size={19} strokeWidth={1.8} className="sidebar-item-icon" />
            <span className="sidebar-item-label">
              {locale === 'vi' ? '🇻🇳 Tiếng Việt' : '🇺🇸 English'}
            </span>
          </button>
        </div>

        {/* User Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-avatar">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName || t('user.guest')}</div>
            {userEmail && (
              <div className="sidebar-user-email">{userEmail}</div>
            )}
          </div>
          {onLogout && (
            <button className="sidebar-logout" onClick={onLogout} title={t('user.logout')}>
              <LogOut size={16} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
