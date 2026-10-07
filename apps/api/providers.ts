import { mediaSchema, type Media, type MediaType } from '../../shared/domain.ts';
import { AppError } from './store.ts';

type Env = Record<string, string | undefined>;
type Fetcher = typeof fetch;
export function providerStatus(env: Env) {
  return {
    book: { available: true, name: 'Open Library' },
    game: { available: Boolean(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET), name: 'IGDB' },
    movie: { available: Boolean(env.TMDB_ACCESS_TOKEN), name: 'TMDB' },
  };
}

async function json(fetcher: Fetcher, url: string, init: RequestInit = {}) {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new AppError(502, 'The catalog is unavailable right now. Try again or add the item manually.');
  return response.json();
}

export function createCatalog(env: Env, fetcher: Fetcher = fetch) {
  let token: { value: string; expires: number } | undefined;
  const cache = new Map<string, { expires: number; results: Media[] }>();
  return async (type: MediaType, query: string): Promise<Media[]> => {
    if (!providerStatus(env)[type].available) throw new AppError(503, `${providerStatus(env)[type].name} search is not configured. You can add this item manually.`);
    const key = `${type}:${query.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.results;
    let results: Media[];
    if (type === 'book') {
      const url = new URL('https://openlibrary.org/search.json');
      url.search = new URLSearchParams({ q: query, limit: '15', fields: 'key,title,author_name,first_publish_year,cover_i' }).toString();
      const data = await json(fetcher, url.href, { headers: { 'User-Agent': 'Backlog/0.1 (personal media organizer)' } });
      results = (data.docs ?? []).map((book: { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number }) => ({
        type, source: 'openlibrary', sourceId: book.key, title: book.title,
        subtitle: book.author_name?.join(', ').slice(0, 200) ?? '',
        year: book.first_publish_year ? String(book.first_publish_year) : '',
        coverUrl: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : '',
      }));
    } else if (type === 'movie') {
      const url = new URL('https://api.themoviedb.org/3/search/movie');
      url.search = new URLSearchParams({ query, include_adult: 'false', language: 'en-US', page: '1' }).toString();
      const data = await json(fetcher, url.href, { headers: { Authorization: `Bearer ${env.TMDB_ACCESS_TOKEN}` } });
      results = (data.results ?? []).slice(0, 15).map((movie: { id: number; title: string; original_title: string; release_date?: string; poster_path?: string }) => ({
        type, source: 'tmdb', sourceId: String(movie.id), title: movie.title, subtitle: movie.original_title !== movie.title ? movie.original_title : '',
        year: movie.release_date?.slice(0, 4) ?? '', coverUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : '',
      }));
    } else {
      if (!token || token.expires < Date.now()) {
        const auth = await json(fetcher, 'https://id.twitch.tv/oauth2/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: env.IGDB_CLIENT_ID!, client_secret: env.IGDB_CLIENT_SECRET!, grant_type: 'client_credentials' }),
        });
        token = { value: auth.access_token, expires: Date.now() + (auth.expires_in - 60) * 1000 };
      }
      const data = await json(fetcher, 'https://api.igdb.com/v4/games', {
        method: 'POST', headers: { 'Client-ID': env.IGDB_CLIENT_ID!, Authorization: `Bearer ${token.value}`, 'Content-Type': 'text/plain' },
        body: `search ${JSON.stringify(query)}; fields name,cover.image_id,first_release_date,platforms.name; limit 15;`,
      });
      results = data.map((game: { id: number; name: string; first_release_date?: number; cover?: { image_id: string }; platforms?: { name: string }[] }) => ({
        type, source: 'igdb', sourceId: String(game.id), title: game.name,
        subtitle: game.platforms?.map(platform => platform.name).join(', ').slice(0, 200) ?? '',
        year: game.first_release_date ? String(new Date(game.first_release_date * 1000).getUTCFullYear()) : '',
        coverUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : '',
      }));
    }
    // An odd provider record must not make the entire search fail.
    results = results.flatMap(result => { const parsed = mediaSchema.safeParse(result); return parsed.success ? [parsed.data] : []; });
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { results, expires: Date.now() + 60000 });
    return results;
  };
}
