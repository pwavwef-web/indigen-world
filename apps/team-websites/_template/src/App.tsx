/**
 * Per-member personal site. Replace the placeholder content below with the
 * member's own details, then update index.html's <title> and description.
 */

const member = {
  name: 'Team Member',
  role: 'Role at Indigen World',
  bio: 'A short introduction goes here — who they are and what they work on.',
  links: [
    // { label: 'GitHub', href: 'https://github.com/…' },
    // { label: 'Email', href: 'mailto:…' },
  ] as { label: string; href: string }[],
};

export default function App() {
  return (
    <main className="page">
      <header className="hero">
        <h1>{member.name}</h1>
        <p className="role">{member.role}</p>
      </header>

      <section className="bio">
        <p>{member.bio}</p>
      </section>

      {member.links.length > 0 && (
        <nav className="links" aria-label="Contact and profiles">
          {member.links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      )}

      <footer className="footer">
        <a href="/">Indigen World</a>
      </footer>
    </main>
  );
}
