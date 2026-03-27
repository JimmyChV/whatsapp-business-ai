import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const useChatWindowMapController = ({
  buildApiHeaders,
  onPrefillMessage
}) => {
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapQuery, setMapQuery] = useState('');
  const [mapEmbedUrl, setMapEmbedUrl] = useState('');
  const [mapSuggestions, setMapSuggestions] = useState([]);
  const [mapSuggestionsLoading, setMapSuggestionsLoading] = useState(false);
  const [mapResolveLoading, setMapResolveLoading] = useState(false);
  const [selectedMapSuggestion, setSelectedMapSuggestion] = useState(null);

  const parseMapCoord = (value) => Number.parseFloat(String(value ?? '').replace(',', '.'));
  const isValidMapLat = (value) => Number.isFinite(value) && value >= -90 && value <= 90;
  const isValidMapLng = (value) => Number.isFinite(value) && value >= -180 && value <= 180;

  const extractCoordsToken = (value = '') => {
    const source = String(value || '');
    if (!source) return null;
    const patterns = [
      /@(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
      /[?&](?:q|query|ll|sll|destination|daddr)=(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
      /\b(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})\b/
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      const lat = parseMapCoord(match[1]);
      const lng = parseMapCoord(match[2]);
      if (isValidMapLat(lat) && isValidMapLng(lng)) return { lat, lng };
    }
    return null;
  };

  const normalizeMapSeed = (seed = '') => {
    const raw = String(seed || '').trim();
    if (!raw) return '';
    if (!/^https?:\/\//i.test(raw)) return raw;

    const normalizedUrl = raw.replace(/[),.;!?]+$/g, '');
    try {
      const parsed = new URL(normalizedUrl);
      for (const key of ['q', 'query', 'll', 'sll', 'destination', 'daddr']) {
        const fromParam = parsed.searchParams.get(key);
        if (!fromParam) continue;
        const trimmed = String(fromParam).trim();
        if (!trimmed) continue;
        const coords = extractCoordsToken(trimmed);
        if (coords) return `${coords.lat},${coords.lng}`;
        return trimmed;
      }

      const decodedPath = decodeURIComponent(`${parsed.pathname || ''}${parsed.hash || ''}`);
      const pathCoords = extractCoordsToken(decodedPath);
      if (pathCoords) return `${pathCoords.lat},${pathCoords.lng}`;

      const placeMatch = decodedPath.match(/\/place\/([^/]+)/i);
      if (placeMatch?.[1]) return String(placeMatch[1]).replace(/\+/g, ' ');

      const searchMatch = decodedPath.match(/\/search\/([^/]+)/i);
      if (searchMatch?.[1]) return String(searchMatch[1]).replace(/\+/g, ' ');

      return normalizedUrl;
    } catch (e) {
      return normalizedUrl;
    }
  };

  const buildMapEmbedUrl = (seed = '') => {
    const normalized = normalizeMapSeed(seed);
    if (!normalized) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(normalized)}&output=embed`;
  };

  const buildExternalMapUrl = (seed = '') => {
    const raw = String(seed || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const normalized = normalizeMapSeed(raw);
    if (!normalized) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(normalized)}`;
  };

  const toSuggestionItem = (item = {}) => {
    const latitude = parseMapCoord(item?.latitude);
    const longitude = parseMapCoord(item?.longitude);
    const hasCoords = isValidMapLat(latitude) && isValidMapLng(longitude);
    const label = String(item?.label || '').trim();
    const mapUrl = String(item?.mapUrl || '').trim();
    if (!label && !hasCoords && !mapUrl) return null;
    const seed = hasCoords ? `${latitude},${longitude}` : (normalizeMapSeed(mapUrl || label) || label);
    return {
      id: String(item?.id || seed || label || Date.now()),
      label: label || (hasCoords ? `${latitude}, ${longitude}` : 'Ubicacion'),
      latitude: hasCoords ? latitude : null,
      longitude: hasCoords ? longitude : null,
      seed,
      mapUrl: mapUrl || buildExternalMapUrl(seed)
    };
  };

  const resolveMapUrlViaApi = async (rawUrl = '') => {
    const cleanUrl = String(rawUrl || '').trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return null;
    try {
      const encoded = encodeURIComponent(cleanUrl);
      const response = await fetch(`${API_URL}/api/map-resolve?url=${encoded}`, {
        headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
      });
      const payload = await response.json();
      if (!payload?.ok) return null;
      return {
        seed: String(payload.seed || '').trim(),
        latitude: parseMapCoord(payload.latitude),
        longitude: parseMapCoord(payload.longitude),
        mapUrl: String(payload.resolvedUrl || cleanUrl).trim()
      };
    } catch (e) {
      return null;
    }
  };

  const selectMapSuggestion = (item = null) => {
    const suggestion = toSuggestionItem(item);
    if (!suggestion) return;
    setSelectedMapSuggestion(suggestion);
    setMapQuery(suggestion.label);
    setMapEmbedUrl(buildMapEmbedUrl(suggestion.seed));
    setMapSuggestions([]);
  };

  const openMapModal = async ({ query = '', mapUrl = '', latitude = null, longitude = null } = {}) => {
    const lat = parseMapCoord(latitude);
    const lng = parseMapCoord(longitude);
    const hasCoords = isValidMapLat(lat) && isValidMapLng(lng);

    const initialSeed = hasCoords
      ? `${lat},${lng}`
      : String(mapUrl || query || '').trim();
    const normalizedSeed = normalizeMapSeed(initialSeed);

    setShowMapModal(true);
    setSelectedMapSuggestion(null);
    setMapSuggestions([]);
    setMapQuery(normalizedSeed || initialSeed || '');
    setMapEmbedUrl(buildMapEmbedUrl(normalizedSeed || initialSeed));

    if (/^https?:\/\//i.test(initialSeed)) {
      setMapResolveLoading(true);
      const resolved = await resolveMapUrlViaApi(initialSeed);
      setMapResolveLoading(false);
      if (!resolved) return;

      const resolvedSeed = normalizeMapSeed(resolved.seed || resolved.mapUrl || initialSeed);
      const resolvedSuggestion = toSuggestionItem({
        id: resolved.mapUrl || resolvedSeed,
        label: resolvedSeed || initialSeed,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        mapUrl: resolved.mapUrl
      });

      if (resolvedSuggestion) {
        setSelectedMapSuggestion(resolvedSuggestion);
        setMapQuery(resolvedSuggestion.label);
        setMapEmbedUrl(buildMapEmbedUrl(resolvedSuggestion.seed));
      }
    }
  };

  const submitMapSearch = async (event) => {
    event.preventDefault();
    if (selectedMapSuggestion) {
      setMapEmbedUrl(buildMapEmbedUrl(selectedMapSuggestion.seed));
      return;
    }

    const currentQuery = String(mapQuery || '').trim();
    if (!currentQuery) {
      setMapEmbedUrl('');
      return;
    }

    if (/^https?:\/\//i.test(currentQuery)) {
      setMapResolveLoading(true);
      const resolved = await resolveMapUrlViaApi(currentQuery);
      setMapResolveLoading(false);
      if (resolved) {
        const suggestion = toSuggestionItem({
          id: resolved.mapUrl || resolved.seed,
          label: normalizeMapSeed(resolved.seed || resolved.mapUrl || currentQuery) || currentQuery,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          mapUrl: resolved.mapUrl
        });
        if (suggestion) {
          setSelectedMapSuggestion(suggestion);
          setMapQuery(suggestion.label);
          setMapEmbedUrl(buildMapEmbedUrl(suggestion.seed));
          return;
        }
      }
    }

    setMapEmbedUrl(buildMapEmbedUrl(currentQuery));
  };

  useEffect(() => {
    if (!showMapModal) {
      setMapSuggestions([]);
      setMapSuggestionsLoading(false);
      return;
    }

    const query = String(mapQuery || '').trim();
    if (!query || query.length < 2 || /^https?:\/\//i.test(query)) {
      setMapSuggestions([]);
      setMapSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setMapSuggestionsLoading(true);
        const encoded = encodeURIComponent(query);
        const response = await fetch(`${API_URL}/api/map-suggest?q=${encoded}&limit=8`, {
          headers: typeof buildApiHeaders === 'function' ? buildApiHeaders() : undefined
        });
        const payload = await response.json();
        if (cancelled) return;
        const items = Array.isArray(payload?.items)
          ? payload.items.map((item) => toSuggestionItem(item)).filter(Boolean)
          : [];
        setMapSuggestions(items);
      } catch (e) {
        if (!cancelled) setMapSuggestions([]);
      } finally {
        if (!cancelled) setMapSuggestionsLoading(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mapQuery, showMapModal]);

  const mapExternalUrl = selectedMapSuggestion?.mapUrl
    || (mapEmbedUrl ? buildExternalMapUrl(mapQuery) : '');

  const shareMapSelection = () => {
    const selected = selectedMapSuggestion;
    const externalUrl = selected?.mapUrl || mapExternalUrl;
    if (!externalUrl) return;

    const header = selected?.label ? `${selected.label}\n` : '';
    const composed = `${header}${externalUrl}`.trim();
    if (typeof onPrefillMessage === 'function') {
      onPrefillMessage(composed);
    }
    setShowMapModal(false);
  };

  const canShareLocation = Boolean(selectedMapSuggestion?.mapUrl || mapExternalUrl);

  return {
    showMapModal,
    setShowMapModal,
    mapQuery,
    setMapQuery,
    mapEmbedUrl,
    setMapEmbedUrl,
    mapSuggestions,
    setMapSuggestions,
    mapSuggestionsLoading,
    setMapSuggestionsLoading,
    mapResolveLoading,
    setMapResolveLoading,
    selectedMapSuggestion,
    setSelectedMapSuggestion,
    selectMapSuggestion,
    openMapModal,
    submitMapSearch,
    mapExternalUrl,
    shareMapSelection,
    canShareLocation
  };
};

export default useChatWindowMapController;
