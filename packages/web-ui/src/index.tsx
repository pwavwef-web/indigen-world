import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

function cx(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/* ==========================================================================
   Button
   ========================================================================== */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glow';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        `iw-button iw-button--${variant} iw-button--${size}`,
        isLoading && 'is-loading',
        className,
      )}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? <span className="iw-spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

/* ==========================================================================
   Badge
   ========================================================================== */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'cultural' | 'gold';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(`iw-badge iw-badge--${tone}`, className)} {...rest}>
      {children}
    </span>
  );
}

/* ==========================================================================
   Container & SectionHeading
   ========================================================================== */
export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  narrow?: boolean;
}

export function Container({ className, children, narrow, ...rest }: ContainerProps) {
  return (
    <div className={cx('iw-container', narrow && 'iw-container--narrow', className)} {...rest}>
      {children}
    </div>
  );
}

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  body?: string;
  light?: boolean;
  align?: 'left' | 'center';
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  light = false,
  align = 'left',
}: SectionHeadingProps) {
  return (
    <div className={cx('iw-section-heading', light && 'is-light', `align-${align}`)}>
      {eyebrow ? <p className="iw-eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {body ? <p className="iw-section-heading__body">{body}</p> : null}
    </div>
  );
}

/* ==========================================================================
   Modal / Dialog
   ========================================================================== */
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
}

export function Modal({ isOpen, onClose, title, children, size = 'medium' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="iw-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={cx(`iw-modal iw-modal--${size}`)}
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        <div className="iw-modal__header">
          {title ? <h3>{title}</h3> : <span />}
          <button
            type="button"
            className="iw-modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        <div className="iw-modal__content">{children}</div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Drawer / Slide-out Sheet
   ========================================================================== */
export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  position?: 'left' | 'right';
}

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  position = 'right',
}: DrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="iw-drawer-backdrop" onClick={onClose}>
      <aside
        className={cx(`iw-drawer iw-drawer--${position}`)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="iw-drawer__header">
          {title ? <h3>{title}</h3> : <span />}
          <button
            type="button"
            className="iw-drawer__close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
        <div className="iw-drawer__content">{children}</div>
      </aside>
    </div>
  );
}

/* ==========================================================================
   Tabs
   ========================================================================== */
export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <nav className={cx('iw-tabs', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={cx('iw-tab', activeTab === tab.id && 'is-active')}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon ? <span className="iw-tab__icon">{tab.icon}</span> : null}
          <span>{tab.label}</span>
          {tab.badge !== undefined ? (
            <span className="iw-tab__badge">{tab.badge}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

/* ==========================================================================
   Interactive Waveform Audio Player
   ========================================================================== */
export interface AudioPlayerProps {
  src?: string;
  label?: string;
  dialect?: string;
  speakerName?: string;
  onEnded?: () => void;
}

export function AudioPlayer({
  src,
  label,
  dialect,
  speakerName,
  onEnded,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current && src) {
      audioRef.current = new Audio(src);
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setProgress(0);
        onEnded?.();
      };
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current && audioRef.current.duration) {
          setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
      };
    }

    if (!audioRef.current) {
      // Synthetic simulated audio if no src given
      setIsPlaying(!isPlaying);
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  return (
    <div className="iw-audio-player">
      <button
        type="button"
        className={cx('iw-audio-btn', isPlaying && 'is-playing')}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="iw-audio-player__body">
        <div className="iw-audio-player__info">
          {label ? <strong>{label}</strong> : <span>Native pronunciation</span>}
          {dialect ? <Badge tone="cultural">{dialect}</Badge> : null}
          {speakerName ? <small className="iw-audio-speaker">by {speakerName}</small> : null}
        </div>

        {/* Synthetic Waveform Visualizer */}
        <div className="iw-waveform-bar" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
          setProgress(pct);
          if (audioRef.current && audioRef.current.duration) {
            audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
          }
        }}>
          <div className="iw-waveform-track" style={{ width: `${progress}%` }} />
          <div className="iw-waveform-bars" aria-hidden="true">
            {[40, 70, 90, 60, 30, 80, 100, 50, 75, 45, 90, 60, 35, 80, 95, 40].map((h, i) => (
              <span
                key={i}
                style={{ height: `${h}%` }}
                className={cx(progress > (i / 16) * 100 && 'is-active')}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="iw-audio-speeds">
        {[0.75, 1, 1.25].map((rate) => (
          <button
            key={rate}
            type="button"
            className={cx('iw-speed-btn', playbackRate === rate && 'is-active')}
            onClick={() => changeSpeed(rate)}
          >
            {rate}x
          </button>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================================
   Toast Notification System
   ========================================================================== */
export interface Toast {
  id: string;
  title?: string;
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'> & { duration?: number }) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ title, message, tone = 'info', duration = 4000 }: Omit<Toast, 'id'> & { duration?: number }) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, title, message, tone }]);
      if (duration > 0) {
        window.setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="iw-toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('iw-toast', `iw-toast--${t.tone}`)}>
            <div className="iw-toast__content">
              {t.title ? <strong>{t.title}</strong> : null}
              <p>{t.message}</p>
            </div>
            <button
              type="button"
              className="iw-toast__close"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss toast"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toasts: [],
      addToast: (t: Omit<Toast, 'id'>) => console.log('Toast:', t),
      removeToast: () => {},
    };
  }
  return ctx;
}

/* ==========================================================================
   Skeleton Shimmer
   ========================================================================== */
export function Skeleton({ lines = 3, height }: { lines?: number; height?: string }) {
  return (
    <div className="iw-skeleton-group">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="iw-skeleton"
          style={{
            height: height || (i === 0 ? '24px' : '16px'),
            width: i === lines - 1 ? '70%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

/* ==========================================================================
   Avatar & AvatarGroup
   ========================================================================== */
export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'small' | 'medium' | 'large';
  badge?: ReactNode;
}

export function Avatar({ name, src, size = 'medium', badge }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={cx('iw-avatar', `iw-avatar--${size}`)} title={name}>
      {src ? (
        <img src={src} alt={name} className="iw-avatar__img" />
      ) : (
        <span className="iw-avatar__initials">{initials}</span>
      )}
      {badge ? <span className="iw-avatar__badge">{badge}</span> : null}
    </div>
  );
}

/* ==========================================================================
   Progress Bar
   ========================================================================== */
export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  tone?: 'terracotta' | 'gold' | 'green' | 'indigo';
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercent = true,
  tone = 'terracotta',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  return (
    <div className="iw-progress-wrap">
      {(label || showPercent) && (
        <div className="iw-progress-head">
          {label ? <span className="iw-progress-label">{label}</span> : <span />}
          {showPercent ? <span className="iw-progress-pct">{pct}%</span> : null}
        </div>
      )}
      <div className="iw-progress-track">
        <div
          className={cx('iw-progress-fill', `iw-progress-fill--${tone}`)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ==========================================================================
   Streak & XP Badge
   ========================================================================== */
export function StreakBadge({ count, label = 'Day Streak' }: { count: number; label?: string }) {
  return (
    <div className="iw-streak-badge" title={`${count} ${label}`}>
      <span className="iw-streak-icon" role="img" aria-label="Streak flame">🔥</span>
      <div>
        <strong>{count}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

/* ==========================================================================
   Animated Counter Rollup
   ========================================================================== */
export function CounterRollup({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1200;
    const stepTime = 20;
    const totalSteps = duration / stepTime;
    const increment = target / totalSteps;

    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [target]);

  return (
    <span className="iw-counter">
      {count.toLocaleString()}{suffix}
    </span>
  );
}

/* ==========================================================================
   Theme Switcher & Accessibility Toolbar
   ========================================================================== */
export type ThemeMode = 'light' | 'dark' | 'sepia' | 'high-contrast';

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem('iw-theme') as ThemeMode) || 'light';
    }
    return 'light';
  });

  const changeTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', newTheme);
      document.body.className = `theme-${newTheme}`;
      localStorage.setItem('iw-theme', newTheme);
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.className = `theme-${theme}`;
    }
  }, [theme]);

  return (
    <div className="iw-theme-selector" role="group" aria-label="Theme mode selection">
      <button
        type="button"
        className={cx('iw-theme-btn', theme === 'light' && 'is-active')}
        onClick={() => changeTheme('light')}
        title="Light Theme"
      >
        ☀️
      </button>
      <button
        type="button"
        className={cx('iw-theme-btn', theme === 'dark' && 'is-active')}
        onClick={() => changeTheme('dark')}
        title="Dark Theme"
      >
        🌙
      </button>
      <button
        type="button"
        className={cx('iw-theme-btn', theme === 'sepia' && 'is-active')}
        onClick={() => changeTheme('sepia')}
        title="Sepia Reading Theme"
      >
        📜
      </button>
    </div>
  );
}

export function AccessibilityToolbar() {
  const [dyslexic, setDyslexic] = useState(false);
  const [fontSizeScale, setFontSizeScale] = useState(100);

  const toggleDyslexic = () => {
    const next = !dyslexic;
    setDyslexic(next);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('iw-dyslexia-font', next);
    }
  };

  const changeScale = (delta: number) => {
    const next = Math.max(90, Math.min(130, fontSizeScale + delta));
    setFontSizeScale(next);
    if (typeof document !== 'undefined') {
      document.documentElement.style.fontSize = `${next}%`;
    }
  };

  return (
    <div className="iw-a11y-toolbar">
      <button
        type="button"
        className={cx('iw-a11y-btn', dyslexic && 'is-active')}
        onClick={toggleDyslexic}
        title="Toggle Dyslexia-Friendly Font"
      >
        Aa
      </button>
      <button
        type="button"
        className="iw-a11y-btn"
        onClick={() => changeScale(-10)}
        title="Decrease Text Size"
      >
        A-
      </button>
      <button
        type="button"
        className="iw-a11y-btn"
        onClick={() => changeScale(10)}
        title="Increase Text Size"
      >
        A+
      </button>
    </div>
  );
}

/* ==========================================================================
   Daily Kasem Proverb & Shareable Social Quote Generator
   ========================================================================== */
export interface ProverbData {
  kasem: string;
  phonetic?: string;
  translation: string;
  meaning: string;
  dialect?: string;
  category?: string;
}

export function ProverbCard({ proverb }: { proverb: ProverbData }) {
  const [copied, setCopied] = useState(false);

  const generateSocialImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background Indigo Gradient
    const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
    grad.addColorStop(0, '#101C36');
    grad.addColorStop(1, '#1E365D');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Decorative Cultural Gold Frame
    ctx.strokeStyle = '#C58A00';
    ctx.lineWidth = 6;
    ctx.strokeRect(50, 50, 980, 980);

    // Top Brand Eyebrow
    ctx.fillStyle = '#D6A52B';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('INDIGEN WORLD • PROJECT KASENA', 100, 140);
    ctx.fillText('KASEM PROVERB OF THE DAY', 100, 185);

    // Main Kasem Quote Text
    ctx.fillStyle = '#FFFDF8';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`“${proverb.kasem}”`, 100, 340);

    // English Translation
    ctx.fillStyle = '#F0D99C';
    ctx.font = 'italic 34px sans-serif';
    ctx.fillText(`“${proverb.translation}”`, 100, 480);

    // Cultural Meaning Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(100, 560, 880, 260);

    ctx.fillStyle = '#E4E8F0';
    ctx.font = '28px sans-serif';
    ctx.fillText('Cultural Wisdom:', 130, 620);

    ctx.fillStyle = '#BAC4D6';
    ctx.font = '26px sans-serif';
    ctx.fillText(proverb.meaning, 130, 680);

    // Footer
    ctx.fillStyle = '#8D9BB0';
    ctx.font = '22px sans-serif';
    ctx.fillText('Learn and preserve indigenous languages at indigen.world', 100, 960);

    // Download Trigger
    const link = document.createElement('a');
    link.download = `kasem-proverb-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="iw-proverb-card iw-glass-card">
      <div className="iw-proverb-head">
        <span className="iw-eyebrow">✦ Kasem Proverb of the Day</span>
        {proverb.dialect && <Badge tone="cultural">{proverb.dialect}</Badge>}
      </div>

      <blockquote className="iw-proverb-kasem">
        “{proverb.kasem}”
      </blockquote>

      {proverb.phonetic && (
        <p className="iw-proverb-phonetic">/{proverb.phonetic}/</p>
      )}

      <p className="iw-proverb-translation">
        <strong>Literal:</strong> {proverb.translation}
      </p>

      <div className="iw-proverb-meaning">
        <strong>Cultural Meaning:</strong> {proverb.meaning}
      </div>

      <div className="iw-proverb-actions">
        <AudioPlayer label="Listen in Kasem" dialect={proverb.dialect || 'Kasem'} />
        <Button variant="secondary" size="small" onClick={generateSocialImage}>
          {copied ? '✓ Image Downloaded!' : '📸 Generate Share Card'}
        </Button>
      </div>
    </div>
  );
}

