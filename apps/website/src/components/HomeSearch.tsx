import { useState } from 'react';
import { useRoute } from '../app/router';
import { Icon } from './Icon';

export function HomeSearch() {
  const { navigate } = useRoute();
  const [query, setQuery] = useState('');
  return <form className="home-search" role="search" action="/dictionary" onSubmit={event => {
    event.preventDefault();
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set('q', query.trim());
    navigate(`dictionary${parameters.size ? `?${parameters}` : ''}#dictionary-results-heading`);
  }}>
    <label htmlFor="home-dictionary-query">Find a word, discover a meaning</label>
    <div className="home-search__field">
      <Icon name="search" size={22} />
      <input id="home-dictionary-query" name="q" type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Kasem or English" autoComplete="off" />
      <button type="submit">Search <Icon name="arrow" size={18} /></button>
    </div>
  </form>;
}
