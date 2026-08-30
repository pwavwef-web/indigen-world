import { useState } from "react";
import { Badge, Button } from "@indigen-world/web-ui";

interface Phrase {
  id: string;
  kasem: string;
  phonetic: string;
  english: string;
  context: string;
  category: "greetings" | "family" | "market" | "proverbs";
}

const PHRASES: Phrase[] = [
  {
    id: "p1",
    kasem: "Nia pe yogo",
    phonetic: "nee-ah peh yoh-goh",
    english: "Good morning / Peace be with you",
    context: "Universal respectful morning greeting across Eastern & Western Kassena.",
    category: "greetings",
  },
  {
    id: "p2",
    kasem: "De wone yogo?",
    phonetic: "deh woh-neh yoh-goh",
    english: "How is your body / health?",
    context: "Inquiring about someone's wellbeing and family condition.",
    category: "greetings",
  },
  {
    id: "p3",
    kasem: "Ba / Ina",
    phonetic: "bah / ee-nah",
    english: "Father / Mother",
    context: "Foundational kinship terms showing respect to elders.",
    category: "family",
  },
  {
    id: "p4",
    kasem: "Nia ne vogo",
    phonetic: "nee-ah neh voh-goh",
    english: "Welcome home / to our house",
    context: "Warm hospitality greeting upon welcoming travelers or guests.",
    category: "family",
  },
  {
    id: "p5",
    kasem: "Ye logo de wone?",
    phonetic: "yeh loh-goh deh woh-neh",
    english: "How much is this item?",
    context: "Essential marketplace and trading phrase in Navrongo and Paga.",
    category: "market",
  },
  {
    id: "p6",
    kasem: "Nia tuuri",
    phonetic: "nee-ah too-ree",
    english: "Thank you very much / May you be blessed",
    context: "Deep expression of gratitude for a gift, help, or transaction.",
    category: "market",
  },
  {
    id: "p7",
    kasem: "Kukuri ba bore ne voro",
    phonetic: "koo-koo-ree bah boh-reh neh voh-roh",
    english: "A dog does not bark at its master's lineage",
    context: "Proverb signifying loyalty, gratitude, and remembrance of roots.",
    category: "proverbs",
  },
];

export function KasemStarterKit() {
  const [activeCategory, setActiveCategory] = useState<Phrase["category"]>("greetings");
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filtered = PHRASES.filter((p) => p.category === activeCategory);

  const playPhrase = (id: string) => {
    setPlayingId(id);
    setTimeout(() => setPlayingId(null), 1800);
  };

  const downloadCheatSheet = () => {
    const text = `INDIGEN WORLD • KASEM STARTER KIT CHEAT SHEET\n\n` +
      PHRASES.map(
        (p) =>
          `[${p.category.toUpperCase()}]\nKasem: ${p.kasem} (/${p.phonetic}/)\nEnglish: ${p.english}\nContext: ${p.context}\n\n`
      ).join("\n") +
      `Preserve indigenous knowledge: https://indigen.world`;

    const blob = new Blob([text], { type: "text/plain" });
    const link = document.createElement("a");
    link.download = `kasem-phrasebook-starter-kit.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  return (
    <div className="starter-kit-container iw-glass-card">
      <div className="starter-kit-header">
        <div>
          <span className="iw-eyebrow">✦ Educational Toolkit</span>
          <h3>Kasem Audio Phrasebook &amp; Starter Kit</h3>
          <p className="tiny muted">Essential everyday vocabulary with phonetic guides and native audio previews.</p>
        </div>
        <Button variant="secondary" size="small" onClick={downloadCheatSheet}>
          📥 Download Printable Sheet
        </Button>
      </div>

      {/* Category Pills */}
      <div className="starter-kit-tabs">
        {(
          [
            ["greetings", "👋 Greetings"],
            ["family", "🏡 Family & Kinship"],
            ["market", "🧺 Market & Trade"],
            ["proverbs", "🏺 Proverbs & Wisdom"],
          ] as const
        ).map(([cat, label]) => (
          <button
            key={cat}
            type="button"
            className={`phrase-tab ${activeCategory === cat ? "is-active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Phrase Cards */}
      <div className="phrases-grid">
        {filtered.map((phrase) => {
          const isPlaying = playingId === phrase.id;
          return (
            <div key={phrase.id} className="phrase-card">
              <div className="phrase-card__head">
                <strong className="phrase-kasem">“{phrase.kasem}”</strong>
                <Badge tone="cultural">{phrase.category}</Badge>
              </div>
              <p className="phrase-phonetic">/{phrase.phonetic}/</p>
              <p className="phrase-english">
                <strong>English:</strong> {phrase.english}
              </p>
              <p className="phrase-context tiny muted">{phrase.context}</p>

              <button
                type="button"
                className={`phrase-audio-btn ${isPlaying ? "is-playing" : ""}`}
                onClick={() => playPhrase(phrase.id)}
                aria-label={`Listen to ${phrase.kasem}`}
              >
                {isPlaying ? "🔊 Playing audio…" : "▶ Listen"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
