import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { config } from '@udaan/app/config';
import { getAirports, getExploreDashboard } from '@udaan/services/explore';
import type { Airport, RouteSummary } from '@udaan/services/types';

interface Props {
  onSearch?: (query: string) => void;
  searchValue?: string;
}

export function AppHeader({ onSearch, searchValue = '' }: Props) {
  const [q, setQ] = useState(searchValue);
  const [focused, setFocused] = useState(false);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setQ(searchValue);
  }, [searchValue]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getAirports(), getExploreDashboard()]).then(([a, d]) => {
      if (cancelled) return;
      setAirports(a);
      setRoutes(d.routes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => {
    const query = q.trim().toLowerCase();
    const airportMatches = (query
      ? airports.filter(
          (a) =>
            a.iata.toLowerCase().includes(query) ||
            a.city.toLowerCase().includes(query) ||
            a.name.toLowerCase().includes(query),
        )
      : airports.filter((a) => ['DEL', 'BOM', 'BLR', 'HYD', 'MAA'].includes(a.iata))
    ).slice(0, 5);

    const routeMatches = (query
      ? routes.filter(
          (r) =>
            r.origin.toLowerCase().includes(query) ||
            r.destination.toLowerCase().includes(query) ||
            r.originCity.toLowerCase().includes(query) ||
            r.destinationCity.toLowerCase().includes(query) ||
            `${r.origin} ${r.destination}`.toLowerCase().includes(query) ||
            `${r.originCity} ${r.destinationCity}`.toLowerCase().includes(query),
        )
      : routes.slice(0, 4)
    ).slice(0, 5);

    return { airports: airportMatches, routes: routeMatches };
  }, [q, airports, routes]);

  const showSuggest = suggestions.airports.length > 0 || suggestions.routes.length > 0;

  function applySearch(value: string) {
    setQ(value);
    onSearch?.(value);
    if (location.pathname !== '/' && !location.pathname.startsWith('/explore')) {
      navigate('/explore');
    }
    setFocused(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    applySearch(q);
  }

  return (
    <header className="udaan-header">
      <NavLink to="/" className="udaan-brand">
        <img
          className="udaan-brand-logo"
          src="/brand/udaan_logo.svg"
          width={34}
          height={34}
          alt=""
        />
        <div className="udaan-brand-text">
          <strong>{config.appName}</strong>
          <span>{config.appTagline}</span>
        </div>
      </NavLink>

      <div className="udaan-search-wrap" ref={wrapRef}>
        <form className="udaan-search" onSubmit={submit} role="search">
          <span aria-hidden="true" className="udaan-search-icon">
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (wrapRef.current?.contains(next)) return;
              window.setTimeout(() => setFocused(false), 120);
            }}
            placeholder="Search route or airport — Delhi, BOM, DEL → BLR"
            aria-label="Search route or airport"
            aria-expanded={focused}
            aria-controls="udaan-search-suggest"
            autoComplete="off"
          />
        </form>
        {focused && showSuggest && (
          <div className="udaan-search-suggest" id="udaan-search-suggest" role="listbox">
            {suggestions.airports.length > 0 && (
              <div className="suggest-group">
                <div className="suggest-heading">Airports</div>
                {suggestions.airports.map((a) => (
                  <button
                    key={a.iata}
                    type="button"
                    className="suggest-item"
                    role="option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySearch(a.iata)}
                  >
                    <span>
                      {a.city} — {a.iata}
                    </span>
                    <span className="suggest-meta">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            {suggestions.routes.length > 0 && (
              <div className="suggest-group">
                <div className="suggest-heading">Routes</div>
                {suggestions.routes.map((r) => (
                  <button
                    key={`${r.origin}-${r.destination}`}
                    type="button"
                    className="suggest-item"
                    role="option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applySearch(`${r.origin} → ${r.destination}`)}
                  >
                    <span>
                      {r.originCity} → {r.destinationCity}
                    </span>
                    <span className="suggest-meta">
                      {r.origin} → {r.destination}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="udaan-nav" aria-label="Primary">
        <NavLink
          to="/explore"
          className={({ isActive }) =>
            isActive || location.pathname === '/' ? 'active' : undefined
          }
        >
          Explore
        </NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
        <NavLink to="/data-operations">Data Ops</NavLink>
      </nav>
    </header>
  );
}
