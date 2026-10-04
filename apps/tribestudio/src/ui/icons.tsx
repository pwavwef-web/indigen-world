import type { ReactNode } from 'react';

/**
 * The studio's one icon family: 24px grid, round caps and joins, a 1.75
 * stroke. Icons sit beside a text label wherever they mean something; an
 * icon on its own is either decorative or carries an accessible name on the
 * control that holds it.
 */
export type IconName =
  | 'overview' | 'home' | 'assignments' | 'contributions' | 'activity' | 'guide' | 'kawuri' | 'account'
  | 'more' | 'logout' | 'arrow' | 'back' | 'check' | 'check-circle' | 'alert' | 'info' | 'clock' | 'lock'
  | 'bank' | 'phone' | 'upload' | 'download' | 'shield' | 'help' | 'external' | 'close' | 'spark' | 'search'
  | 'user' | 'users' | 'bell' | 'doc' | 'video' | 'image' | 'audio' | 'mic' | 'plus' | 'menu' | 'chevron'
  | 'chevron-down' | 'opportunities' | 'translation' | 'undo' | 'redo' | 'play' | 'pause' | 'up' | 'down'
  | 'copy' | 'trash' | 'music' | 'sound' | 'stop' | 'edit' | 'send' | 'refresh' | 'eye' | 'filter'
  | 'layers' | 'film' | 'book' | 'globe' | 'link' | 'calendar' | 'flag' | 'star' | 'award' | 'wallet'
  | 'inbox' | 'compass' | 'grid' | 'list' | 'sun' | 'moon' | 'contrast' | 'type' | 'motion' | 'sidebar'
  | 'quote' | 'scale' | 'archive' | 'sparkles' | 'map' | 'pin' | 'record' | 'wave' | 'puzzle' | 'tag'
  | 'message' | 'settings' | 'key' | 'gift' | 'flame' | 'database' | 'branch' | 'target' | 'x-circle'
  | 'pen' | 'library' | 'cloud' | 'wifi-off' | 'hourglass' | 'circle';

const ICONS: Record<IconName, ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.6" /><rect x="13.5" y="11" width="7" height="9.5" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9v10.5h12V9" /><path d="M10 19.5v-5h4v5" /></>,
  assignments: <><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 3.5V6h6V3.5" /><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" /></>,
  contributions: <><path d="M12 20h8.5" /><path d="M16.5 3.6a2.1 2.1 0 0 1 3 3L7.2 18.9l-4 1 1-4Z" /></>,
  activity: <path d="M3 12h4l3 8 4-16 3 8h4" />,
  guide: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3.5H6.5A2.5 2.5 0 0 0 4 6v13.5Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /><path d="M9 8h6" /></>,
  kawuri: <><path d="M12 3.5 13.9 9 19.5 11l-5.6 2-1.9 5.5-1.9-5.5L4.5 11l5.6-2Z" /><path d="M19 3.5v3M17.5 5h3" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  logout: <><path d="M15 17l5-5-5-5M20 12H9" /><path d="M12 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H12" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 18l-6-6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19.5 7" />,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.7L16.2 9.5" /></>,
  alert: <><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4.2M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  bank: <><path d="m3.5 9.5 8.5-5.5 8.5 5.5" /><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8M3.5 20.5h17" /></>,
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" /><path d="M11 18.5h2" /></>,
  upload: <><path d="M12 15.5V4M7 9l5-5 5 5" /><path d="M4 16.5v2A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-2" /></>,
  download: <><path d="M12 4v11.5M7 10.5l5 5 5-5" /><path d="M4 16.5v2A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-2" /></>,
  shield: <><path d="M12 3 4.5 6v5.6c0 4.8 3.2 8 7.5 9.4 4.3-1.4 7.5-4.6 7.5-9.4V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.2 9.2a2.9 2.9 0 1 1 4.1 2.6c-.9.5-1.3 1.1-1.3 2.1M12 17h.01" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  spark: <path d="M12 3.5 13.9 9 19.5 11l-5.6 2-1.9 5.5-1.9-5.5L4.5 11l5.6-2Z" />,
  sparkles: <><path d="M10 3.5 11.6 8 16 9.5l-4.4 1.6L10 15.5l-1.6-4.4L4 9.5 8.4 8Z" /><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  bell: <><path d="M18 9.5a6 6 0 0 0-12 0c0 6.5-2.5 7.5-2.5 8.5h17c0-1-2.5-2-2.5-8.5" /><path d="M10 21h4" /></>,
  doc: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z" /><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" /></>,
  video: <><rect x="2.5" y="5.5" width="14" height="13" rx="2" /><path d="m16.5 10 5-3v10l-5-3" /></>,
  film: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M8 3.5v17M16 3.5v17M3.5 8H8M3.5 12h17M3.5 16H8M16 8h4.5M16 16h4.5" /></>,
  image: <><rect x="3.5" y="3.5" width="17" height="17" rx="2.2" /><circle cx="9" cy="9" r="1.6" /><path d="m20.5 15.5-4.5-4.5L5.5 20.5" /></>,
  audio: <><path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 6v12" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>,
  record: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" /></>,
  wave: <path d="M2.5 12h2l2-5 3 10 3-14 3 12 2-6 1.5 3h2.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  opportunities: <><rect x="3" y="7.5" width="18" height="13" rx="2" /><path d="M8.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2.5M3 13h18" /></>,
  translation: <><path d="M4 5h9M8.5 3v2M10.8 5c-.7 4-3.2 7-6.3 8.5M6.6 9.2c1.2 2 3 3.5 5.4 4.3" /><path d="m13 20.5 3.8-9 3.7 9M14.4 17.5h4.8" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  play: <path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.3-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7Z" />,
  pause: <><rect x="6.5" y="4.5" width="3.5" height="15" rx="1" /><rect x="14" y="4.5" width="3.5" height="15" rx="1" /></>,
  stop: <rect x="5.5" y="5.5" width="13" height="13" rx="2" />,
  up: <path d="M12 19.5v-15M6 10.5l6-6 6 6" />,
  down: <path d="M12 4.5v15M6 13.5l6 6 6-6" />,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2" /><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" /></>,
  trash: <><path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l.9 13a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13" /><path d="M10 10.5v6M14 10.5v6" /></>,
  music: <><path d="M9 18V5.5l11-2v12.5" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  sound: <><path d="M4 9.5h3.5l5-4v13l-5-4H4Z" /><path d="M16 9a4.5 4.5 0 0 1 0 6M18.8 6.2a8.5 8.5 0 0 1 0 11.6" /></>,
  edit: <><path d="M11.5 4.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2v-5.5" /><path d="M18.4 3.4a2 2 0 0 1 2.9 2.9L12.5 15l-3.8.9.9-3.8Z" /></>,
  pen: <><path d="M14.5 5.5 18.5 9.5" /><path d="M16.9 3.1a2 2 0 0 1 2.9 2.9L8 17.8l-4 1.2 1.2-4Z" /></>,
  send: <><path d="m21.5 2.5-19 7.2 7.5 3.3 3.3 7.5Z" /><path d="M21.5 2.5 10 13" /></>,
  refresh: <><path d="M20 11.5A8 8 0 0 0 6.2 6.3L4 8.5" /><path d="M4 4v4.5h4.5M4 12.5a8 8 0 0 0 13.8 5.2L20 15.5" /><path d="M20 20v-4.5h-4.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  filter: <path d="M3.5 5h17l-6.5 7.7V19l-4 1.8v-8.1Z" />,
  layers: <><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  book: <><path d="M12 6.5c-2-1.7-5-2-8.5-1.5v13.5c3.5-.5 6.5-.2 8.5 1.5 2-1.7 5-2 8.5-1.5V5c-3.5-.5-6.5-.2-8.5 1.5Z" /><path d="M12 6.5V20" /></>,
  library: <><path d="M4 4.5h3.5v15H4zM9.5 4.5H13v15H9.5z" /><path d="m15 5.4 3.3-.9 3.2 14.6-3.3.8Z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4.5c4-2 7 2 11 0l2.5-1V13l-2.5 1c-4 2-7-2-11 0" /></>,
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8Z" />,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.4-1.5 7.6 5-2.7 5 2.7-1.5-7.6" /></>,
  wallet: <><path d="M4 7.5V18a2 2 0 0 0 2 2h13.5v-4.5" /><path d="M4 7.5a2 2 0 0 1 2-2h11.5v3" /><path d="M19.5 10.5h-4a2 2 0 0 0 0 4h4Z" /></>,
  gift: <><rect x="3.5" y="8" width="17" height="4.5" rx="1" /><path d="M5 12.5v8h14v-8M12 8v12.5" /><path d="M12 8c-1.5-3.5-5.5-3.5-5.5-1S12 8 12 8Zm0 0c1.5-3.5 5.5-3.5 5.5-1S12 8 12 8Z" /></>,
  flame: <path d="M12 21c4 0 6.5-2.6 6.5-6.3 0-4.6-4.2-6.4-4.8-11.2C11 5 9 8 9 10.7 7.6 9.6 7 8.4 7 8.4 5.8 10 5.5 12.2 5.5 14.7 5.5 18.4 8 21 12 21Z" />,
  inbox: <><path d="M3.5 13.5 6 5.5h12l2.5 8V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19Z" /><path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></>,
  map: <><path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2Z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  pin: <><path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  list: <path d="M8.5 6h12M8.5 12h12M8.5 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  contrast: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" /></>,
  type: <path d="M5 7V5h14v2M12 5v14M9 19h6" />,
  motion: <><path d="M4 12h3M4 7.5h5M4 16.5h5" /><circle cx="15.5" cy="12" r="5" /></>,
  sidebar: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9.5 4v16" /></>,
  quote: <><path d="M9.5 7.5H6A1.5 1.5 0 0 0 4.5 9v3A1.5 1.5 0 0 0 6 13.5h3.5V17a2.5 2.5 0 0 1-2.5 2.5" /><path d="M19.5 7.5H16A1.5 1.5 0 0 0 14.5 9v3a1.5 1.5 0 0 0 1.5 1.5h3.5V17a2.5 2.5 0 0 1-2.5 2.5" /></>,
  scale: <><path d="M12 3.5v17M7.5 20.5h9M5 7.5h14M5 7.5 2.5 13a3 3 0 0 0 5 0Zm14 0L16.5 13a3 3 0 0 0 5 0Z" /></>,
  archive: <><rect x="3" y="4" width="18" height="4.5" rx="1" /><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4" /></>,
  puzzle: <path d="M9 4.5h3.5v2a1.8 1.8 0 1 0 3.5 0v-2h3.5V9h-2a1.8 1.8 0 1 0 0 3.5h2V19.5H16v-2a1.8 1.8 0 1 0-3.5 0v2H4.5V15h2a1.8 1.8 0 1 0 0-3.5h-2V4.5Z" />,
  tag: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0Z" /><circle cx="8" cy="8" r="1.4" /></>,
  message: <path d="M4.5 5.5h15a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H10l-4.5 3.5V17h-1a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.2 11.8 9.3-9.3M16.5 6.5l2.5 2.5M14 9l2 2" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" /></>,
  branch: <><circle cx="6" cy="5.5" r="2.5" /><circle cx="6" cy="18.5" r="2.5" /><circle cx="18" cy="8" r="2.5" /><path d="M6 8v8M18 10.5a6 6 0 0 1-6 6H8.5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  'x-circle': <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  cloud: <path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.7A3.7 3.7 0 0 1 17.5 18.5Z" />,
  'wifi-off': <><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M12 7.5a10 10 0 0 1 7 5M12 20h.01" /></>,
  hourglass: <><path d="M6.5 3.5h11M6.5 20.5h11" /><path d="M7.5 3.5c0 5 9 5.5 9 9s-9 4-9 8M16.5 3.5c0 5-9 5.5-9 9s9 4 9 8" /></>,
  circle: <circle cx="12" cy="12" r="8.5" />,
};

export function Icon({ name, className = '', title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      className={`ts-icon ts-icon--${name}${className ? ` ${className}` : ''}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
