import L from 'leaflet';
import type { LatLngTuple, LatLngExpression } from 'leaflet';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import './App.css';
import { parseCoolingShelterCsv } from './lib/parseCoolingShelters.ts';
import {
  distanceInMeters,
  estimateDurationSeconds,
  findNearestShelter,
  formatDistance,
  formatDuration,
  type TravelMode,
} from './lib/geo.ts';
import type { CoolingShelter, GeoPoint } from './types.ts';

type LoadState = 'loading' | 'ready' | 'error';
type GeoStatus =
  | 'idle'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'error'
  | 'unsupported';

type RouteData = {
  coordinates: LatLngTuple[];
  distance: number;
  duration: number;
};

const DEFAULT_CENTER: LatLngTuple = [35.8617, 139.6455];
const DEFAULT_ZOOM = 10;
const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1';

const parseEncoding = (contentType: string | null): string | undefined => {
  if (!contentType) return undefined;
  const match = contentType.match(/charset=([^;]+)/i);
  return match ? match[1].trim().toLowerCase() : undefined;
};

const decodeCsvResponse = async (response: Response): Promise<string> => {
  const buffer = await response.arrayBuffer();
  const declared = parseEncoding(response.headers.get('content-type'));
  const candidates = [
    declared,
    'utf-8',
    'utf8',
    'shift_jis',
    'sjis',
    'windows-31j',
  ].filter((value): value is string => Boolean(value));

  const tried = new Set<string>();
  for (const encoding of candidates) {
    const canonical = encoding.toLowerCase();
    if (tried.has(canonical)) continue;
    tried.add(canonical);
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch {
      continue;
    }
  }

  return new TextDecoder().decode(buffer);
};

type FetchResult = { shelters: CoolingShelter[]; sourceUrl: string };

const fetchSheltersFromCandidates = async (
  sources: string[],
): Promise<FetchResult> => {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      const trimmed = source.trim();
      if (!trimmed) continue;
      const response = await fetch(trimmed, {
        headers: {
          Accept: 'text/csv,application/octet-stream;q=0.9',
          'User-Agent':
            'UDC2025-2 Cooling Shelters Demo (+https://example.com/support)',
        },
      });
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText}`,
        );
      }
      const csvText = await decodeCsvResponse(response);
      const shelters = await parseCoolingShelterCsv(csvText);
      if (shelters.length === 0) {
        throw new Error('データが空でした。');
      }
      return { shelters, sourceUrl: trimmed };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      errors.push(`${source}: ${message}`);
    }
  }

  throw new Error(errors.join('\n'));
};

type MapControllerProps = {
  selectedShelter?: CoolingShelter | null;
  userLocation?: GeoPoint | null;
  route?: RouteData | null;
};

function MapController({
  selectedShelter,
  userLocation,
  route,
}: MapControllerProps) {
  const map = useMap();
  const lastShelterId = useRef<string | null>(null);
  const lastRouteKey = useRef<string | null>(null);

  useEffect(() => {
    if (route && route.coordinates.length > 1) {
      const bounds = route.coordinates.reduce(
        (acc, coord) => acc.extend(coord as LatLngExpression),
        new L.LatLngBounds(route.coordinates[0], route.coordinates[0]),
      );
      if (userLocation) {
        bounds.extend([userLocation.latitude, userLocation.longitude]);
      }
      const routeKey = `${route.distance}-${route.duration}`;
      if (lastRouteKey.current !== routeKey) {
        lastRouteKey.current = routeKey;
        map.fitBounds(bounds.pad(0.18), { animate: true });
      }
      return;
    }

    if (selectedShelter) {
      if (lastShelterId.current === selectedShelter.id) {
        return;
      }
      lastShelterId.current = selectedShelter.id;
      map.flyTo(
        [selectedShelter.latitude, selectedShelter.longitude],
        14,
        { duration: 0.8 },
      );
      return;
    }

    if (userLocation) {
      map.flyTo(
        [userLocation.latitude, userLocation.longitude],
        12,
        { duration: 0.8 },
      );
    }
  }, [map, route, selectedShelter, userLocation]);

  return null;
}

type ShelterWithDistance = CoolingShelter & {
  distanceMeters?: number;
};

type RouteApiResponse = {
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: Array<[number, number]> };
  }>;
  code?: string;
  message?: string;
};

function App() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [shelters, setShelters] = useState<CoolingShelter[]>([]);
  const [selectedShelterId, setSelectedShelterId] = useState<string | null>(
    null,
  );
  const autoSelectionRef = useRef(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [municipalityFilter, setMunicipalityFilter] = useState('all');

  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);

  const [routeMode, setRouteMode] = useState<TravelMode>('walk');
  const [route, setRoute] = useState<RouteData | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('unsupported');
      return;
    }
    setGeoStatus('pending');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setGeoStatus('granted');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGeoStatus('denied');
        } else {
          setGeoStatus('error');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadState('loading');
      setLoadError(null);
      const preferredFromEnv =
        import.meta.env.VITE_COOLING_SHELTER_URL?.trim() ?? '';
      const sources = [
        preferredFromEnv,
        '/data/cooling-shelters.csv',
        '/data/cooling-shelters.sample.csv',
      ].filter(Boolean);
      try {
        const { shelters: data, sourceUrl } =
          await fetchSheltersFromCandidates(sources);
        if (cancelled) return;
        setShelters(data);
        setDataSource(sourceUrl);
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        setLoadState('error');
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        setLoadError(message);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (shelters.length === 0) {
      return;
    }
    if (userLocation && autoSelectionRef.current) {
      const nearest = findNearestShelter(shelters, userLocation);
      if (nearest) {
        setSelectedShelterId(nearest.shelter.id);
        autoSelectionRef.current = true;
        return;
      }
    }
    if (!selectedShelterId) {
      const firstId = shelters[0]?.id ?? null;
      setSelectedShelterId(firstId);
      autoSelectionRef.current = true;
    }
  }, [shelters, userLocation, selectedShelterId]);

  const selectedShelter = useMemo(
    () => shelters.find((item) => item.id === selectedShelterId) ?? null,
    [selectedShelterId, shelters],
  );

  const sheltersWithDistance: ShelterWithDistance[] = useMemo(() => {
    if (!userLocation) {
      return shelters;
    }
    return shelters.map((shelter) => ({
      ...shelter,
      distanceMeters: distanceInMeters(userLocation, {
        latitude: shelter.latitude,
        longitude: shelter.longitude,
      }),
    }));
  }, [shelters, userLocation]);

  const nearestShelter = useMemo(() => {
    if (!userLocation || shelters.length === 0) return undefined;
    return findNearestShelter(shelters, userLocation);
  }, [shelters, userLocation]);

  useEffect(() => {
    if (!selectedShelterId && nearestShelter) {
      setSelectedShelterId(nearestShelter.shelter.id);
    }
  }, [nearestShelter, selectedShelterId]);

  const municipalityOptions = useMemo(() => {
    const unique = new Set(
      shelters
        .map((shelter) => shelter.municipalityName)
        .filter(Boolean),
    );
    return Array.from(unique).sort((a, b) =>
      a.localeCompare(b, 'ja-JP'),
    );
  }, [shelters]);

  const filteredShelters = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matches = sheltersWithDistance.filter((shelter) => {
      if (
        municipalityFilter !== 'all' &&
        shelter.municipalityName !== municipalityFilter
      ) {
        return false;
      }
      if (!normalizedSearch) return true;
      return (
        shelter.name.toLowerCase().includes(normalizedSearch) ||
        shelter.address.toLowerCase().includes(normalizedSearch) ||
        shelter.municipalityName
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });

    matches.sort((a, b) => {
      if (userLocation) {
        const distanceA = a.distanceMeters ?? Number.POSITIVE_INFINITY;
        const distanceB = b.distanceMeters ?? Number.POSITIVE_INFINITY;
        if (distanceA !== distanceB) {
          return distanceA - distanceB;
        }
      }
      return a.name.localeCompare(b.name, 'ja-JP');
    });

    return matches;
  }, [
    municipalityFilter,
    searchTerm,
    sheltersWithDistance,
    userLocation,
  ]);

  useEffect(() => {
    if (!userLocation || !selectedShelter) {
      setRoute(null);
      setRouteError(null);
      setRouteLoading(false);
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const profile = routeMode === 'walk' ? 'foot' : 'driving';
        const url = `${OSRM_ENDPOINT}/${profile}/${userLocation.longitude},${userLocation.latitude};${selectedShelter.longitude},${selectedShelter.latitude}?overview=full&geometries=geojson&steps=false`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const payload = (await response.json()) as RouteApiResponse;
        const firstRoute = payload.routes?.[0];
        if (!firstRoute) {
          throw new Error(payload.message ?? '経路が見つかりませんでした。');
        }
        const coordinates = firstRoute.geometry.coordinates.map(
          ([lon, lat]) => [lat, lon] as LatLngTuple,
        );
        if (!controller.signal.aborted) {
          setRoute({
            coordinates,
            distance: firstRoute.distance,
            duration: firstRoute.duration,
          });
          setRouteError(null);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : JSON.stringify(error);
        setRoute(null);
        setRouteError(message);
      } finally {
        if (!controller.signal.aborted) {
          setRouteLoading(false);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [routeMode, selectedShelter, userLocation]);

  const handleSelectShelter = (shelterId: string) => {
    autoSelectionRef.current = false;
    setSelectedShelterId(shelterId);
  };

  const googleMapsLink = useMemo(() => {
    if (!selectedShelter) return '#';
    const query = new URLSearchParams({
      api: '1',
      destination: `${selectedShelter.latitude},${selectedShelter.longitude}`,
      travelmode: routeMode === 'walk' ? 'walking' : 'driving',
    });
    return `https://www.google.com/maps/dir/?${query.toString()}`;
  }, [routeMode, selectedShelter]);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>埼玉県クーリングスポットナビ</h1>
          <p className="app__description">
            埼玉県が公開する指定暑熱避難施設（クーリングシェルター）のオープンデータをもとに、最寄りの避難先を探せます。
          </p>
        </div>
        <div className="app__meta">
          {dataSource && (
            <span>
              データソース:{' '}
              <a href={dataSource} target="_blank" rel="noreferrer">
                {dataSource}
              </a>
            </span>
          )}
          <span>
            施設数: <strong>{shelters.length}</strong>
          </span>
        </div>
      </header>

      <main className="app__main">
        <section className="sidebar">
          <div className="panel">
            <div className="panel__section">
              <label className="field">
                <span>キーワードで探す</span>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="施設名・住所で検索"
                />
              </label>
              <label className="field">
                <span>市区町村で絞り込む</span>
                <select
                  value={municipalityFilter}
                  onChange={(event) =>
                    setMunicipalityFilter(event.target.value)
                  }
                >
                  <option value="all">すべて</option>
                  {municipalityOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="panel__section panel__section--status">
              <div className={`geostatus geostatus--${geoStatus}`}>
                {geoStatus === 'pending' && <span>現在地を取得しています…</span>}
                {geoStatus === 'granted' && <span>現在地を利用中</span>}
                {geoStatus === 'denied' && (
                  <span>現在地の取得が拒否されました。</span>
                )}
                {geoStatus === 'error' && (
                  <span>現在地の取得中にエラーが発生しました。</span>
                )}
                {geoStatus === 'unsupported' && (
                  <span>このブラウザーでは位置情報を取得できません。</span>
                )}
              </div>
              <button
                type="button"
                onClick={requestLocation}
                className="link-button"
              >
                現在地を更新する
              </button>
            </div>

            {nearestShelter && (
              <div className="panel__section panel__section--highlight">
                <h2>最寄りの避難先</h2>
                <p className="highlight__title">
                  {nearestShelter.shelter.name}
                </p>
                <p className="highlight__meta">
                  {nearestShelter.shelter.municipalityName} ／{' '}
                  {formatDistance(nearestShelter.distanceMeters)}
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    handleSelectShelter(nearestShelter.shelter.id)
                  }
                >
                  詳細を見る
                </button>
              </div>
            )}

            <div className="panel__section panel__section--list">
              <h2>クーリングスポット一覧</h2>
              {loadState === 'loading' && (
                <p>データを読み込み中です…</p>
              )}
              {loadState === 'error' && (
                <div className="error-card">
                  <p>データの取得に失敗しました。</p>
                  <pre>{loadError}</pre>
                  <p>
                    ネットワーク接続状況をご確認のうえ、リロードしてください。
                  </p>
                </div>
              )}
              {loadState === 'ready' && filteredShelters.length === 0 && (
                <p>該当する施設がありません。</p>
              )}
              {loadState === 'ready' && filteredShelters.length > 0 && (
                <ul className="shelter-list">
                  {filteredShelters.map((shelter) => (
                    <li key={shelter.id}>
                      <button
                        type="button"
                        className={`shelter-item${
                          shelter.id === selectedShelterId
                            ? ' shelter-item--active'
                            : ''
                        }`}
                        onClick={() => handleSelectShelter(shelter.id)}
                      >
                        <span className="shelter-item__name">
                          {shelter.name}
                        </span>
                        <span className="shelter-item__meta">
                          {shelter.municipalityName}
                          {shelter.distanceMeters !== undefined && (
                            <>
                              {' '}
                              ·{' '}
                              {formatDistance(shelter.distanceMeters)}
                            </>
                          )}
                        </span>
                        <span className="shelter-item__address">
                          {shelter.address}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="panel panel--details">
            {selectedShelter ? (
              <>
                <h2>{selectedShelter.name}</h2>
                <p className="details__address">
                  {selectedShelter.municipalityName} ／{' '}
                  {selectedShelter.address}
                </p>
                {nearestShelter &&
                  nearestShelter.shelter.id === selectedShelter.id && (
                    <p className="details__badge">現在地から最寄り</p>
                  )}
                <div className="details__metrics">
                  {userLocation && (
                    <div>
                      <span className="label">現在地から</span>
                      <span>
                        {formatDistance(
                          distanceInMeters(userLocation, {
                            latitude: selectedShelter.latitude,
                            longitude: selectedShelter.longitude,
                          }),
                        )}
                      </span>
                    </div>
                  )}
                  {selectedShelter.capacity !== null &&
                    selectedShelter.capacity !== undefined && (
                      <div>
                        <span className="label">想定受入人数</span>
                        <span>
                          {selectedShelter.capacity.toLocaleString('ja-JP')}
                          人
                        </span>
                      </div>
                    )}
                </div>

                <section className="details__section">
                  <h3>開放時間</h3>
                  <table className="hours-table">
                    <tbody>
                      {selectedShelter.openings.map((window) => (
                        <tr key={window.dayLabel}>
                          <th>{window.dayLabel}</th>
                          <td>
                            {window.open && window.close
                              ? `${window.open}〜${window.close}`
                              : window.open
                                ? `${window.open}〜`
                                : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedShelter.specialNotes && (
                    <p className="details__notes">
                      {selectedShelter.specialNotes}
                    </p>
                  )}
                </section>

                <section className="details__section">
                  <h3>連絡先</h3>
                  <dl className="details__definition-list">
                    {selectedShelter.manager && (
                      <>
                        <dt>管理者</dt>
                        <dd>{selectedShelter.manager}</dd>
                      </>
                    )}
                    {selectedShelter.phone && (
                      <>
                        <dt>電話番号</dt>
                        <dd>
                          <a href={`tel:${selectedShelter.phone}`}>
                            {selectedShelter.phone}
                          </a>
                        </dd>
                      </>
                    )}
                    {selectedShelter.email && (
                      <>
                        <dt>メール</dt>
                        <dd>
                          <a href={`mailto:${selectedShelter.email}`}>
                            {selectedShelter.email}
                          </a>
                        </dd>
                      </>
                    )}
                    {selectedShelter.url && (
                      <>
                        <dt>ウェブサイト</dt>
                        <dd>
                          <a
                            href={selectedShelter.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {selectedShelter.url}
                          </a>
                        </dd>
                      </>
                    )}
                    {selectedShelter.designationDate && (
                      <>
                        <dt>指定日</dt>
                        <dd>{selectedShelter.designationDate}</dd>
                      </>
                    )}
                    {selectedShelter.facilityTypeCategory && (
                      <>
                        <dt>施設分類</dt>
                        <dd>{selectedShelter.facilityTypeCategory}</dd>
                      </>
                    )}
                  </dl>
                </section>

                <section className="details__section">
                  <h3>経路検索</h3>
                  <div className="route-controls">
                    <div className="route-modes">
                      <button
                        type="button"
                        className={
                          routeMode === 'walk'
                            ? 'route-mode route-mode--active'
                            : 'route-mode'
                        }
                        onClick={() => setRouteMode('walk')}
                      >
                        徒歩
                      </button>
                      <button
                        type="button"
                        className={
                          routeMode === 'drive'
                            ? 'route-mode route-mode--active'
                            : 'route-mode'
                        }
                        onClick={() => setRouteMode('drive')}
                      >
                        車
                      </button>
                    </div>
                    {routeLoading && <p>経路を計算中です…</p>}
                    {routeError && (
                      <p className="error-text">
                        経路取得に失敗しました: {routeError}
                      </p>
                    )}
                    {route && (
                      <div className="route-summary">
                        <span>
                          距離 {formatDistance(Math.round(route.distance))}
                        </span>
                        <span>
                          所要時間{' '}
                          {formatDuration(Math.round(route.duration))}
                        </span>
                      </div>
                    )}
                    {!route && !routeLoading && userLocation && (
                      <div className="route-summary">
                        <span>
                          推定距離{' '}
                          {formatDistance(
                            distanceInMeters(userLocation, {
                              latitude: selectedShelter.latitude,
                              longitude: selectedShelter.longitude,
                            }),
                          )}
                        </span>
                        <span>
                          推定時間{' '}
                          {formatDuration(
                            estimateDurationSeconds(
                              distanceInMeters(userLocation, {
                                latitude: selectedShelter.latitude,
                                longitude: selectedShelter.longitude,
                              }),
                              routeMode,
                            ),
                          )}
                        </span>
                      </div>
                    )}
                    <a
                      className="primary-button"
                      href={googleMapsLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Googleマップで開く
                    </a>
                  </div>
                </section>
              </>
            ) : (
              <p>表示する施設を選択してください。</p>
            )}
          </div>
        </section>

        <section className="map-section">
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className="map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController
              selectedShelter={selectedShelter}
              userLocation={userLocation}
              route={route}
            />
            {userLocation && (
              <Marker position={[userLocation.latitude, userLocation.longitude]}>
                <Popup>現在地</Popup>
              </Marker>
            )}
            {shelters.map((shelter) => (
              <Marker
                key={shelter.id}
                position={[shelter.latitude, shelter.longitude]}
                eventHandlers={{
                  click: () => handleSelectShelter(shelter.id),
                }}
              >
                <Popup>
                  <strong>{shelter.name}</strong>
                  <br />
                  {shelter.address}
                </Popup>
              </Marker>
            ))}
            {route && (
              <Polyline
                positions={route.coordinates}
                pathOptions={{ color: '#0078ff', weight: 4, opacity: 0.8 }}
              />
            )}
          </MapContainer>
        </section>
      </main>
    </div>
  );
}

export default App;
