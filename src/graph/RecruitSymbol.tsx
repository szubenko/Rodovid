const silhouette = 'M-14-11l1.5-1.9L5 1l2-.1 3.5 2.9-.3 1.6 5 4.4-3 3.3L3.5 5l.5-1.4Z'

export function RecruitSymbol() {
  return <g fill="currentColor">
    <path d={silhouette} />
    <path d={silhouette} transform="scale(-1 1)" />
  </g>
}
