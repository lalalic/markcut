import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MapStream } from '../schema/index';
import { pointAtRouteProgress, projectSchematicRoute, routeSvgPath } from '../utils/schematic-route';

/** Google-independent, reproducible map chapter. No road map or actual travel track is inferred. */
export function SchematicRouteMap({stream}: {stream: MapStream}) {
  const {width, height, fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const waypoints = stream.waypoints ?? [];
  const points = React.useMemo(() => projectSchematicRoute(waypoints, width, height), [waypoints, width, height]);
  if (!points.length) return null;
  const duration = Math.max(1, Math.round((stream.end ?? (stream.start ?? 0) + (stream.duration ?? 1)) * fps) - Math.round((stream.start ?? 0) * fps));
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, duration - 1)));
  const marker = pointAtRouteProgress(points, progress);
  const path = routeSvgPath(points);
  const total = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0);
  const color = stream.routeColor ?? '#4285F4';
  const headingSize = Math.round(Math.min(width * 0.06, 34));
  const subtitleSize = Math.round(headingSize * .55);
  const pinRadius = Math.max(8, width * .016);
  const first = points[0], last = points[points.length - 1];
  return <AbsoluteFill style={{backgroundColor: '#0d2032'}}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="schematic-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#163450"/><stop offset="1" stopColor="#091726"/>
        </linearGradient>
        <pattern id="schematic-grid" width="54" height="54" patternUnits="userSpaceOnUse">
          <path d="M 54 0 L 0 0 0 54" fill="none" stroke="#ffffff" strokeOpacity=".075" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#schematic-bg)" />
      <rect width={width} height={height} fill="url(#schematic-grid)" />
      <text x={width * .08} y={height * .093} fontSize={headingSize} fill="#ffffff" fontWeight="700" fontFamily="sans-serif">路线示意</text>
      <text x={width * .08} y={height * .14} fontSize={subtitleSize} fill="#9dc2d3" fontFamily="sans-serif">按已验证地点连接 · 非道路导航</text>
      {points.length > 1 && <>
        <path d={path} fill="none" stroke="#ffffff" strokeOpacity=".32" strokeWidth={Math.max(2, stream.routeWeight ?? 4)} strokeDasharray="8 8" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} fill="none" stroke={color} strokeWidth={Math.max(3, stream.routeWeight ?? 4)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${total} ${total}`} strokeDashoffset={total * (1 - progress)} />
      </>}
      {points.map((p, i) => {
        if (points.length > 6 && i > 0 && i < points.length - 1) return null;
        const name = (p.label || (i === 0 ? '出发' : i === points.length - 1 ? '到达' : `站点${i + 1}`)).slice(0, 18);
        const alignRight = p.x > width * .58;
        const nearBottom = p.y > height * .77;
        const labelX = p.x + (alignRight ? -pinRadius * 2 : pinRadius * 2);
        return <g key={i}>
          <circle cx={p.x} cy={p.y} r={pinRadius * .64} fill="#ffffff" opacity=".96" />
          <circle cx={p.x} cy={p.y} r={pinRadius * .33} fill={color} />
          <text x={labelX} y={p.y + (nearBottom ? -pinRadius : -pinRadius * .65)} textAnchor={alignRight ? 'end' : 'start'} fill="#f2f7fa" fontFamily="sans-serif" fontWeight="600" fontSize={Math.max(15, headingSize * .66)}>{name}</text>
        </g>;
      })}
      <circle cx={marker.x} cy={marker.y} r={pinRadius * 2} fill={color} fillOpacity=".2" />
      <circle cx={marker.x} cy={marker.y} r={pinRadius} fill={color} stroke="#ffffff" strokeWidth="3" />
      <rect x={width * .08} y={height * .886} width={width * .84} height={3} rx={1.5} fill="#b9d9e6" opacity=".28" />
      <rect x={width * .08} y={height * .886} width={width * .84 * progress} height={3} rx={1.5} fill={color} />
      <text x={width * .08} y={height * .925} fontSize={subtitleSize} fill="#c8dee7" fontFamily="sans-serif">{(first?.label || '出发').slice(0,14)}</text>
      <text x={width * .92} y={height * .925} textAnchor="end" fontSize={subtitleSize} fill="#c8dee7" fontFamily="sans-serif">{(last?.label || '到达').slice(0,14)}</text>
    </svg>
  </AbsoluteFill>;
}
