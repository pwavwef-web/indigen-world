import { useState } from "react";
import { Badge, Button } from "@indigen-world/web-ui";

interface DialectRegion {
  id: string;
  name: string;
  location: string;
  country: string;
  status: string;
  speakers: string;
  greeting: string;
  greetingTranslation: string;
  description: string;
  coordinates: { x: number; y: number };
}

const REGIONS: DialectRegion[] = [
  {
    id: "navrongo",
    name: "Navrongo (Eastern Kasem)",
    location: "Kassena-Nankana Municipal, Upper East",
    country: "Ghana",
    status: "Active Language Cell",
    speakers: "120,000+",
    greeting: "Nia pe yogo",
    greetingTranslation: "Good morning / Peace be with you",
    description:
      "Core urban hub and major cultural center for Kasena tradition, research partnerships, and dialect documentation.",
    coordinates: { x: 48, y: 55 },
  },
  {
    id: "paga",
    name: "Paga (Western Kasem)",
    location: "Kassena-Nankana West District",
    country: "Ghana",
    status: "Active Heritage Cell",
    speakers: "75,000+",
    greeting: "Te ne yogo",
    greetingTranslation: "Welcome / Peace upon your arrival",
    description:
      "Renowned for sacred crocodile heritage, ancient pikworo slave camp history, and rich oral storytelling traditions.",
    coordinates: { x: 38, y: 38 },
  },
  {
    id: "chiana",
    name: "Chiana & Katiu",
    location: "Western Valley",
    country: "Ghana",
    status: "Recording Cohort",
    speakers: "45,000+",
    greeting: "De wone yogo",
    greetingTranslation: "May health and peace be yours",
    description:
      "Vibrant agricultural and craft communities with unique phonetic tones and extensive proverb repertoires.",
    coordinates: { x: 22, y: 48 },
  },
  {
    id: "tiebele",
    name: "Tiébélé & Pô (Northern Kasem)",
    location: "Nahouri Province, Centre-Sud",
    country: "Burkina Faso",
    status: "Cross-Border Partner Cell",
    speakers: "140,000+",
    greeting: "Nia vogo",
    greetingTranslation: "Greetings and blessings",
    description:
      "World-famous for Gurunsi painted royal compound architecture (Cour Royale) and shared cross-border Kasem lineage.",
    coordinates: { x: 42, y: 18 },
  },
];

export function DialectMap() {
  const [selectedRegion, setSelectedRegion] = useState<DialectRegion>(REGIONS[0]);
  const [playingAudio, setPlayingAudio] = useState(false);

  const simulatePlayGreeting = () => {
    setPlayingAudio(true);
    setTimeout(() => setPlayingAudio(false), 2000);
  };

  return (
    <div className="dialect-map-container iw-glass-card">
      <div className="dialect-map-header">
        <div>
          <span className="iw-eyebrow">✦ Interactive Geography &amp; Dialect Cells</span>
          <h3>Venacula Regional Map</h3>
        </div>
        <Badge tone="cultural">Northern Ghana &amp; Southern Burkina Faso</Badge>
      </div>

      <div className="dialect-map-layout">
        {/* SVG Interactive Map */}
        <div className="dialect-map-canvas">
          <svg viewBox="0 0 100 80" className="map-svg" aria-label="Map of Kasem dialect regions">
            {/* Border Outline: Ghana / Burkina Faso Region */}
            <path
              d="M 10,10 L 90,8 L 85,70 L 15,75 Z"
              fill="rgba(30, 54, 93, 0.08)"
              stroke="var(--border)"
              strokeWidth="0.8"
              strokeDasharray="2,2"
            />
            {/* Border Dividing Line (Ghana / Burkina Faso) */}
            <line
              x1="12"
              y1="30"
              x2="88"
              y2="28"
              stroke="var(--gold)"
              strokeWidth="0.6"
              strokeDasharray="1.5,1.5"
            />
            <text x="75" y="24" fontSize="2.5" fill="var(--gold)" fontWeight="bold">
              BURKINA FASO
            </text>
            <text x="75" y="36" fontSize="2.5" fill="var(--terracotta)" fontWeight="bold">
              GHANA
            </text>

            {/* Region Hotspots */}
            {REGIONS.map((region) => {
              const isSelected = selectedRegion.id === region.id;
              return (
                <g
                  key={region.id}
                  className="map-node-group"
                  onClick={() => setSelectedRegion(region)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select ${region.name}`}
                >
                  <circle
                    cx={region.coordinates.x}
                    cy={region.coordinates.y}
                    r={isSelected ? 4.5 : 3}
                    className={`map-node ${isSelected ? "is-active" : ""}`}
                  />
                  <circle
                    cx={region.coordinates.x}
                    cy={region.coordinates.y}
                    r={isSelected ? 7 : 4}
                    className="map-node-pulse"
                  />
                  <text
                    x={region.coordinates.x}
                    y={region.coordinates.y - 4}
                    fontSize="2.8"
                    fontWeight={isSelected ? "bold" : "normal"}
                    textAnchor="middle"
                    fill="var(--text)"
                  >
                    {region.name.split(" ")[0]}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="tiny map-hint">Click any region node to inspect dialect nuances and local audio.</p>
        </div>

        {/* Selected Region Detail Box */}
        <div className="dialect-detail-card">
          <div className="dialect-detail-head">
            <span className="country-chip">{selectedRegion.country}</span>
            <Badge tone="success">{selectedRegion.status}</Badge>
          </div>
          <h4>{selectedRegion.name}</h4>
          <p className="location-text">📍 {selectedRegion.location}</p>
          <p className="speakers-text">👥 Approx. {selectedRegion.speakers} speakers</p>
          <p className="description-text">{selectedRegion.description}</p>

          <div className="greeting-box">
            <span className="tiny-label">Traditional Greeting in Kasem:</span>
            <strong className="greeting-phrase">“{selectedRegion.greeting}”</strong>
            <span className="greeting-meaning">({selectedRegion.greetingTranslation})</span>
          </div>

          <div className="dialect-actions">
            <Button variant="secondary" size="small" onClick={simulatePlayGreeting}>
              {playingAudio ? "🔊 Playing Greeting…" : "▶ Play Regional Pronunciation"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
